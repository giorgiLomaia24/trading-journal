// ==========================================================================
// ჩაანაცვლე შენს tradeController.js-ში მხოლოდ `exports.getTrades` ფუნქცია
// (დამხმარე ფუნქციები და require-ები ფაილის თავში ჩასვი).
// თუ შენი ფუნქცია სხვა სახელითაა როუტში მიბმული, ის სახელი გამოიყენე.
// ==========================================================================
const mongoose = require('mongoose');
const Trade = require('../models/Trade');
const Strategy = require('../models/Strategy');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SORT_FIELDS = { entryDate: 'entryDate', pnl: 'pnl', symbol: 'symbol' };

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const toList = (v) =>
  (Array.isArray(v) ? v : String(v || '').split(',')).map((s) => s.trim()).filter(Boolean);
const money = (n) => `${n < 0 ? '-' : ''}$${Math.abs(n).toFixed(2)}`;

const isValidTz = (tz) => {
  if (typeof tz !== 'string' || !tz) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
};

// დროის ზონის წანაცვლება მოცემულ მომენტში (მილიწამებში)
const tzOffsetMs = (date, tz) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).formatToParts(date).map((x) => [x.type, x.value])
  );
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
};

// "YYYY-MM-DD"-ის ლოკალური შუაღამე (მოცემულ ზონაში) UTC მომენტად
const startOfDayInTz = (dateStr, tz) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - tzOffsetMs(new Date(guess), tz);
  t = guess - tzOffsetMs(new Date(t), tz); // მეორე გავლა DST-ის საზღვრებისთვის
  return new Date(t);
};

const nextDayStr = (dateStr) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
};

exports.getTrades = async (req, res) => {
  try {
    const q = req.query;
    const userId = new mongoose.Types.ObjectId(req.user);
    const tz = isValidTz(q.tz) ? q.tz : 'UTC';

    const match = { userId };
    const and = [];

    // ანგარიში
    if (q.account && mongoose.Types.ObjectId.isValid(q.account)) {
      match.account = new mongoose.Types.ObjectId(q.account);
    }

    // სტატუსი და ტიპი (ასოების რეგისტრს არ აქვს მნიშვნელობა)
    if (q.status && q.status !== 'all') match.status = String(q.status).toLowerCase();
    if (q.type && q.type !== 'all') match.type = String(q.type).toLowerCase();

    // სესია (ზუსტი სახელი, ასოების რეგისტრის გარეშე)
    if (q.session && q.session !== 'all') {
      match.session = new RegExp(`^${escapeRegex(String(q.session))}$`, 'i');
    }

    // სტრატეგია: მოდის _id ან სახელი. ტრეიდებში სახელი ინახება, ამიტომ ორივეს ვამოწმებთ
    if (q.strategy && q.strategy !== 'all' && q.strategy !== 'All Strategies') {
      const raw = String(q.strategy);
      const names = [raw];
      if (mongoose.Types.ObjectId.isValid(raw)) {
        const s = await Strategy.findOne({ _id: raw, userId }).select('strategyName').lean();
        if (s) names.push(s.strategyName);
      }
      match.strategy = { $in: names };
    }

    // თარიღები: "YYYY-MM-DD" ლოკალური დღის საზღვრებით, ISO თარიღი (კალენდრიდან) პირდაპირ
    const parseBound = (v, isEnd) => {
      if (!v) return null;
      if (DATE_RE.test(v)) {
        return isEnd
          ? new Date(startOfDayInTz(nextDayStr(v), tz).getTime() - 1)
          : startOfDayInTz(v, tz);
      }
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? null : d;
    };
    const from = parseBound(q.fromDate || q.startDate, false);
    const to = parseBound(q.toDate || q.endDate, true);
    if (from || to) {
      match.entryDate = {};
      if (from) match.entryDate.$gte = from;
      if (to) match.entryDate.$lte = to;
    }

    // P&L დიაპაზონი
    const minPnl = parseFloat(q.minPnl);
    const maxPnl = parseFloat(q.maxPnl);
    if (Number.isFinite(minPnl) || Number.isFinite(maxPnl)) {
      match.pnl = {};
      if (Number.isFinite(minPnl)) match.pnl.$gte = minPnl;
      if (Number.isFinite(maxPnl)) match.pnl.$lte = maxPnl;
    }

    // შედეგი: win/loss/breakeven P&L-იდან გამოითვლება (ბაზაში `result` ველი არ ინახება).
    // `partial` მხოლოდ მაშინ იმუშავებს, თუ მომავალში `result` ველსაც შევინახავთ
    const results = toList(q.result).map((r) => r.toLowerCase());
    if (results.length) {
      const cond = [];
      if (results.includes('win')) cond.push({ pnl: { $gt: 0 } });
      if (results.includes('loss')) cond.push({ pnl: { $lt: 0 } });
      if (results.includes('breakeven')) cond.push({ pnl: 0 });
      if (results.includes('partial')) cond.push({ result: 'partial' });
      if (cond.length) and.push({ $or: cond });
    }

    // ტეგები და ემოციები (ერთი მაინც რომ ემთხვეოდეს)
    const exactCi = (arr) => arr.map((t) => new RegExp(`^${escapeRegex(t)}$`, 'i'));
    const tags = toList(q.tags);
    const emotions = toList(q.emotions);
    if (tags.length) match.tags = { $in: exactCi(tags) };
    if (emotions.length) match.emotions = { $in: exactCi(emotions) };

    // ძებნა: სიმბოლო, სტრატეგია, ნოუთები, ტეგები
    const search = typeof q.search === 'string' ? q.search.trim() : '';
    if (search) {
      const rx = new RegExp(escapeRegex(search), 'i');
      and.push({ $or: [{ symbol: rx }, { strategy: rx }, { notes: rx }, { tags: rx }] });
    }

    if (and.length) match.$and = and;

    // სორტირება და პაგინაცია
    const sortField = SORT_FIELDS[q.sortBy] || 'entryDate';
    const sortDir = q.order === 'asc' ? 1 : -1;
    const sort = { [sortField]: sortDir, _id: -1 }; // _id სტაბილური პაგინაციისთვის

    const page = Math.max(parseInt(q.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(q.limit) || 10, 1), 100);

    const [trades, totalTrades, statsAgg] = await Promise.all([
      Trade.find(match).sort(sort).skip((page - 1) * limit).limit(limit).lean(),
      Trade.countDocuments(match),
      // სტატისტიკა ითვლება ყველა გაფილტრულ თრეიდზე და არა მხოლოდ მიმდინარე გვერდზე
      Trade.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            totalPnL: { $sum: '$pnl' },
            wins: { $sum: { $cond: [{ $gt: ['$pnl', 0] }, 1, 0] } },
            rrSum: { $sum: { $cond: [{ $gt: ['$riskRewardRatio', 0] }, '$riskRewardRatio', 0] } },
            rrCount: { $sum: { $cond: [{ $gt: ['$riskRewardRatio', 0] }, 1, 0] } }
          }
        }
      ])
    ]);

    const s = statsAgg[0] || { count: 0, totalPnL: 0, wins: 0, rrSum: 0, rrCount: 0 };
    const avgPnL = s.count ? s.totalPnL / s.count : 0;

    res.json({
      trades,
      pagination: {
        totalTrades,
        totalPages: Math.max(1, Math.ceil(totalTrades / limit)),
        currentPage: page,
        limit
      },
      journalMiniStats: {
        totalTrades: s.count,
        winRate: `${(s.count ? (s.wins / s.count) * 100 : 0).toFixed(1)}%`,
        avgPnL: money(avgPnL),
        avgRiskReward: s.rrCount ? `1:${(s.rrSum / s.rrCount).toFixed(1)}` : '—',
        totalPnL: money(s.totalPnL),
        isPnLPositive: s.totalPnL >= 0,
        isAvgPositive: avgPnL >= 0
      }
    });
  } catch (error) {
    console.error('getTrades error:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'თრეიდების წამოღების შეცდომა', error: error.message });
    }
  }
};

// 1. ახალი თრეიდის დაჟურნალება (Log Trade)
exports.logTrade = async (req, res) => {
  try {
    const {
      account, symbol, type, quantity, entryPrice, exitPrice,
      entryDate, exitDate, pnl, risk, riskType, riskRewardRatio,
      session, strategy, checkedRules, notes, emotions, reflection, images
    } = req.body;

    // ავტომატურად განვსაზღვროთ შედეგი P&L-ის მიხედვით
    const result = pnl > 0 ? ['Win'] : pnl < 0 ? ['Loss'] : ['Breakeven'];

    const newTrade = new Trade({
      userId: req.user, // მოვა ტოკენიდან (authMiddleware)
      account,
      symbol,
      type,
      quantity,
      entryPrice,
      exitPrice,
      entryDate,
      exitDate,
      pnl,
      risk,
      riskType,
      riskRewardRatio,
      session,
      strategy,
      checkedRules: checkedRules || [],
      result,
      notes,
      emotions: emotions || [],
      reflection,
      images: images || [] // მაქსიმუმ 6 ფოტოს ლინკი
    });

    const trade = await newTrade.save();
    res.status(201).json(trade);
  } catch (error) {
    res.status(500).json({ message: 'სერვერის შეცდომა ტრეიდის დაჟურნალებისას', error: error.message });
  }
};


// exports.getTrades = async (req, res) => {
//   try {
//     const userId = req.user;
//     let query = { userId };
//     const {
//       account, status, type, strategy, session,
//       fromDate, toDate, minPnl, maxPnl, result, tags, emotions,
//       page = 1, limit = 10
//     } = req.query;
//     if (account && mongoose.Types.ObjectId.isValid(account)) {
//       query.account = new mongoose.Types.ObjectId(account);
//     }
//     if (status && status !== 'all' && status !== 'All') {
//       query.status = { $regex: new RegExp("^" + status + "$", "i") };
//     }
//     if (type && type !== 'all' && type !== 'All Types') {
//       query.type = { $regex: new RegExp("^" + type + "$", "i") };
//     }
//     if (strategy && strategy !== 'all' && strategy !== 'All Strategies') {
//       query.strategy = { $regex: new RegExp("^" + strategy + "$", "i") };
//     }
//     if (session && session !== 'all' && session !== 'All Sessions') {
//       query.session = { $regex: new RegExp("^" + session + "$", "i") };
//     }
//     if (fromDate || toDate) {
//       query.entryDate = {};
//       if (fromDate) {
//         const startOfDay = new Date(fromDate);
//         startOfDay.setHours(0, 0, 0, 0);
//         query.entryDate.$gte = startOfDay;
//       }
//       if (toDate) {
//         const endOfDay = new Date(toDate);
//         endOfDay.setHours(23, 59, 59, 999);
//         query.entryDate.$lte = endOfDay;
//       }
//     }
//     if (minPnl || maxPnl) {
//       query.pnl = {};
//       if (minPnl) query.pnl.$gte = Number(minPnl);
//       if (maxPnl) query.pnl.$lte = Number(maxPnl);
//     }
//     if (result && result !== 'all') {
//       const resultArr = result.split(',').map(r => new RegExp("^" + r + "$", "i"));
//       query.result = { $in: resultArr };
//     }
//     if (tags) {
//       query.tags = { $in: tags.split(',') };
//     }
//     if (emotions) {
//       query.emotions = { $in: emotions.split(',') };
//     }
//     const pageNum = parseInt(page);
//     const limitNum = parseInt(limit);
//     const skipNum = (pageNum - 1) * limitNum;
//     const totalMatchingTrades = await Trade.countDocuments(query);
//     let tradesQuery = Trade.find(query)
//       .sort({ entryDate: -1 })
//       .skip(skipNum)
//       .limit(limitNum);
//     let trades;
//     try {
//       trades = await tradesQuery.populate({
//         path: 'account',
//         select: 'accountName accountType',
//         options: { strictPopulate: false }
//       });
//     } catch (populateError) {
//       trades = await Trade.find(query)
//         .sort({ entryDate: -1 })
//         .skip(skipNum)
//         .limit(limitNum);
//     }
//     const allFilteredTradesForStats = await Trade.find(query).select('pnl');
//     const totalStatsCount = allFilteredTradesForStats.length;
//     if (totalStatsCount === 0) {
//       return res.json({
//         pagination: { totalTrades: 0, totalPages: 1, currentPage: pageNum, limit: limitNum },
//         journalMiniStats: { totalTrades: 0, winRate: "0.0%", avgPnL: "$0.00", avgRiskReward: "1:2", totalPnL: "$0.00", isPnLPositive: true, isAvgPositive: true },
//         trades: []
//       });
//     }
//     let winCount = 0;
//     let totalPnL = 0;
//     allFilteredTradesForStats.forEach(t => {
//       totalPnL += t.pnl || 0;
//       if (t.pnl > 0) winCount++;
//     });
//     const winRate = (winCount / totalStatsCount) * 100;
//     const avgPnL = totalPnL / totalStatsCount;
//     res.json({
//       pagination: {
//         totalTrades: totalMatchingTrades,
//         totalPages: Math.ceil(totalMatchingTrades / limitNum),
//         currentPage: pageNum,
//         limit: limitNum
//       },
//       journalMiniStats: {
//         totalTrades: totalStatsCount,
//         winRate: winRate.toFixed(1) + "%",
//         avgPnL: (avgPnL >= 0 ? "+" : "-") + Math.abs(avgPnL).toFixed(2),
//         avgRiskReward: "1:2",
//         totalPnL: (totalPnL >= 0 ? "+" : "-") + Math.abs(totalPnL).toFixed(2),
//         isPnLPositive: totalPnL >= 0,
//         isAvgPositive: avgPnL >= 0
//       },
//       trades: trades
      
//     });
//   } catch (error) {
//     res.status(500).json({ message: 'თრეიდების წამოღების შეცდომა', error: error.message });
//   }
// };







// 🚀 განახლებული ბგებისგან დაცული ვერსია (მოშორებულია .populate())

exports.getTradeById = async (req, res) => {
  try {
    // ვეძებთ თრეიდს პირდაპირ ID-ით, .populate-ის გარეშე, რომ სერვერი არ დაკრაშოს
    const trade = await Trade.findOne({ _id: req.params.id, userId: req.user });

    if (!trade) {
      return res.status(404).json({ message: 'თრეიდი ვერ მოიძებნა ან არ გაქვთ წვდომის უფლება' });
    }

    res.json(trade);
  } catch (error) {
    res.status(500).json({ message: 'სერვერის შეცდომა თრეიდის წამოღებისას', error: error.message });
  }
};


// 4. თრეიდის მონაცემების განახლება (Update)
exports.updateTrade = async (req, res) => {
  try {
    const { pnl } = req.body;

    // თუ P&L ახლდება, ავტომატურად გადავთვალოთ შედეგიც (Win/Loss/Breakeven)
    if (pnl !== undefined) {
      req.body.result = pnl > 0 ? ['Win'] : pnl < 0 ? ['Loss'] : ['Breakeven'];
    }

    const trade = await Trade.findOneAndUpdate(
      { _id: req.params.id, userId: req.user },
      { $set: req.body },
      { new: true, runValidators: true } // დააბრუნებს განახლებულ ვერსიას და შეამოწმებს 6 სურათის ლიმიტს
    );

    if (!trade) {
      return res.status(404).json({ message: 'თრეიდი ვერ მოიძებნა ან არ გაქვთ ჩასწორების უფლება' });
    }

    res.json(trade);
  } catch (error) {
    res.status(500).json({ message: 'სერვერის შეცდომა თრეიდის განახლებისას', error: error.message });
  }
};

// 5. თრეიდის წაშლა (Delete)
exports.deleteTrade = async (req, res) => {
  try {
    const trade = await Trade.findOneAndDelete({ _id: req.params.id, userId: req.user });

    if (!trade) {
      return res.status(404).json({ message: 'თრეიდი ვერ მოიძებნა ან არ გაქვთ წაშლის უფლება' });
    }

    res.json({ message: 'თრეიდი წარმატებით წაიშალა ჟურნალიდან' });
  } catch (error) {
    res.status(500).json({ message: 'სერვერის შეცდომა თრეიდის წაშლისას', error: error.message });
  }
};

// 6. READ BY DATE: კონკრეტული დღის თრეიდების წამოღება მოდალისთვის
exports.getTradesByDate = async (req, res) => {
  try {
    const userId = req.user;
    const { date, account } = req.query; // ფორმატი: YYYY-MM-DD

    if (!date) {
      return res.status(400).json({ message: 'თარიღის მითითება სავალდებულოა' });
    }

    const startOfDay = new Date(date);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    let query = {
      userId,
      entryDate: { $gte: startOfDay, $lte: endOfDay }
    };

    if (account) query.account = account;

    const trades = await Trade.find(query).sort({ entryDate: 1 }).populate('account', 'accountName');

    // გამოვთვალოთ მოდალის ზედა მინი-სტატისტიკა (WINS: 1, LOSSES: 1, TOTAL P&L: -$35.00)
    let wins = 0;
    let losses = 0;
    let totalPnL = 0;

    trades.forEach(t => {
      totalPnL += t.pnl;
      if (t.pnl > 0) wins++;
      if (t.pnl < 0) losses++;
    });

    const winRate = trades.length > 0 ? (wins / trades.length) * 100 : 0;

    res.json({
      dateText: new Date(date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }), // "Tuesday, October 13, 2026"
      summary: {
        wins,
        losses,
        totalPnL: totalPnL.toFixed(2),
        winRate: winRate.toFixed(1) + "%",
        isPositive: totalPnL >= 0
      },
      trades: trades
    });

  } catch (error) {
    res.status(500).json({ message: 'დღიური თრეიდების წამოღების შეცდომა', error: error.message });
  }
};
