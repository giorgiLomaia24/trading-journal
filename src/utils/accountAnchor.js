// ==========================================================================
// ბექტესტ ანგარიშის "ვირტუალური დღევანდელი დღე" (anchor)
//
// ჩვეულებრივი ანგარიში (Live, Demo, Funded...): ანკორი არ არსებობს, ანალიტიკა რეალურ "ახლას" იყენებს.
// ბექტესტ ანგარიში: ანკორი = მეტი ამ ორიდან:
//   1) ანგარიშის საწყისი თარიღი (startingDate)
//   2) ამ ანგარიშზე ბოლო ტრეიდის თარიღი
// ამიტომ ახალი ტრეიდების დამატებისას "დღევანდელი დღე" თავისით წინ მიდის.
// ==========================================================================
const mongoose = require('mongoose');
const Account = require('../models/Account');
const Trade = require('../models/Trade');

const BACKTEST_TYPE = 'Backtest';

const isBacktest = (account) => !!account && account.accountType === BACKTEST_TYPE;

const laterOf = (a, b) => {
  const ta = a ? new Date(a).getTime() : NaN;
  const tb = b ? new Date(b).getTime() : NaN;
  const best = Math.max(Number.isFinite(ta) ? ta : -Infinity, Number.isFinite(tb) ? tb : -Infinity);
  return Number.isFinite(best) ? new Date(best) : null;
};

// ბექტესტ ანგარიშების ანკორები: Map(accountId -> Date). ერთი aggregate ყველა ანგარიშისთვის
exports.getAnchorMap = async (userId, accounts) => {
  const map = new Map();
  const backtests = accounts.filter(isBacktest);
  if (backtests.length === 0) return map;

  const lastTrades = await Trade.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(String(userId)),
        account: { $in: backtests.map((a) => a._id) }
      }
    },
    { $group: { _id: '$account', last: { $max: '$entryDate' } } }
  ]);

  const lastById = new Map(lastTrades.map((l) => [String(l._id), l.last]));
  backtests.forEach((a) => {
    map.set(String(a._id), laterOf(a.startingDate, lastById.get(String(a._id))) || new Date());
  });
  return map;
};

// ანგარიშები ფრონტენდისთვის: isBacktest და anchorDate ველებით (ცოცხალზე anchorDate = null)
exports.withAnchors = async (userId, accounts) => {
  const map = await exports.getAnchorMap(userId, accounts);
  return accounts.map((a) => {
    const plain = typeof a.toObject === 'function' ? a.toObject() : a;
    const anchor = map.get(String(a._id));
    return {
      ...plain,
      isBacktest: isBacktest(a),
      anchorDate: anchor ? anchor.toISOString() : null
    };
  });
};

exports.withAnchor = async (userId, account) => (await exports.withAnchors(userId, [account]))[0];

// ანალიტიკისთვის: { now, isBacktest }. ბექტესტზე now = ანკორი, დანარჩენზე რეალური დრო
exports.resolveClock = async (userId, accountId) => {
  const live = { now: new Date(), isBacktest: false };
  if (!accountId || !mongoose.Types.ObjectId.isValid(accountId)) return live;

  const account = await Account.findOne({ _id: accountId, userId })
    .select('accountType startingDate')
    .lean();
  if (!isBacktest(account)) return live;

  const map = await exports.getAnchorMap(userId, [account]);
  return { now: map.get(String(account._id)) || new Date(), isBacktest: true };
};

exports.resolveNow = async (userId, accountId) => (await exports.resolveClock(userId, accountId)).now;

exports.isBacktest = isBacktest;