const Trade = require('../models/Trade');
const Strategy = require('../models/Strategy');
const mongoose = require('mongoose');

const isValidTz = (tz) => {
    if (typeof tz !== "string" || !tz) return false;
    try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
};

const dayKeyInTz = (date, tz) => {
    const p = Object.fromEntries(
        new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
            .formatToParts(date)
            .map((x) => [x.type, x.value])
    );
    return `${p.year}-${p.month}-${p.day}`;
};

const RANGE_DAYS = { "7D": 7, "30D": 30, "90D": 90, "1Y": 365 };
// ==========================================
// Advanced Statistics — დამხმარე ფუნქციები
// ==========================================
const TIMEFRAME_DAYS = { "7 days": 7, "30 days": 30 };

const toNum = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const signed = (n) => (n >= 0 ? "+" : "-") + Math.abs(toNum(n)).toFixed(2);

const buildEmptyResponse = (strategyDonutData = []) => ({
    performanceOverview: {
        totalPnL: "0.00", isPnLPositive: true, winRate: "0.0%", winLossRatioText: "0W / 0L",
        totalTrades: 0, avgWin: "+$0.00", bestWinSymbol: "N/A", avgLoss: "-$0.00",
        worstLossSymbol: "N/A", profitFactor: "0.00", profitFactorStatus: "POOR"
    },
    advancedAnalytics: {
        expectancy: "0.00", sharpeRatio: "0.00", bestTrade: "+$0.00", bestTradeSymbol: "N/A",
        worstTrade: "-$0.00", worstTradeSymbol: "N/A"
    },
    bestPerformance: {
        bestDay: "N/A", bestDayPnL: "0.00", bestWeek: "N/A", bestWeekPnL: "0.00",
        bestMonth: "N/A", bestMonthPnL: "0.00", bestYear: "N/A", bestYearPnL: "0.00",
        bestSession: "N/A"
    },
    charts: { timelineData: [], donutData: { wins: 0, losses: 0 }, strategyDonutData, monthlyData: [] },
    dayOfWeekPerformance: [],
    sessionPerformance: [],
    activeStrategyPerformance: null,
    ruleAdherence: []
});

// სტრატეგიის პირობა ბაზისთვის (ობიექტის ტიპის მიხედვით, ბუნდოვანი შედარების გარეშე)
const buildStrategyCondition = (doc) => {
    const pathType = Trade.schema.path("strategy")?.instance;
    if (pathType === "ObjectId") return doc._id;
    return { $in: [doc._id, doc._id.toString(), doc.strategyName] };
};

// UTC თარიღების დამხმარეები (თანმიმდევრულია Mongo-ს $dateToString-თან)
const dayKeyOf = (d) => d.toISOString().slice(0, 10);
const monthKeyOf = (d) => d.toISOString().slice(0, 7);
const yearKeyOf = (d) => String(d.getUTCFullYear());
const weekStartOf = (d) => {
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); // ორშაბათი
    return x;
};
const fmtShort = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

const addTo = (map, key, v) => { map[key] = (map[key] || 0) + v; };
const pickBest = (map) => {
    let bestKey = null;
    let bestVal = -Infinity;
    for (const k of Object.keys(map)) {
        if (map[k] > bestVal) { bestVal = map[k]; bestKey = k; }
    }
    return bestKey === null ? { key: null, value: 0 } : { key: bestKey, value: bestVal };
};

// ==========================================
// Advanced Statistics — მთავარი კონტროლერი
// ==========================================
exports.getAdvancedStatisticsPage = async (req, res) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.user);
        const { account, strategy = "All Strategies", timeframe = "30 days" } = req.query;

        // 1. ბაზისური ფილტრი (ანგარიში + პერიოდი), სტრატეგიის გარეშე
        const baseMatch = { userId, status: "closed" };
        if (account && mongoose.Types.ObjectId.isValid(account)) {
            baseMatch.account = new mongoose.Types.ObjectId(account);
        }
        const days = TIMEFRAME_DAYS[timeframe];
        if (days) {
            baseMatch.entryDate = { $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) };
        }

        // 2. სტრატეგიები + გლობალური განაწილება (სტრატეგიის ფილტრისგან დამოუკიდებლად)
        const [allUserStrategies, strategyGroups] = await Promise.all([
            Strategy.find({ userId }).lean(),
            Trade.aggregate([
                { $match: baseMatch },
                { $group: { _id: "$strategy", count: { $sum: 1 } } }
            ])
        ]);

        const strategyById = new Map(allUserStrategies.map((s) => [s._id.toString(), s]));
        const strategyByName = new Map(allUserStrategies.map((s) => [s.strategyName.toLowerCase(), s]));

        const resolveStrategyName = (raw) => {
            if (raw === null || raw === undefined || raw === "") return "Unknown";
            const str = raw.toString();
            const found = strategyById.get(str) || strategyByName.get(str.toLowerCase());
            return found ? found.strategyName : str;
        };

        const donutCounts = {};
        strategyGroups.forEach((g) => addTo(donutCounts, resolveStrategyName(g._id), g.count));
        const donutTotal = Object.values(donutCounts).reduce((a, b) => a + b, 0);
        const strategyDonutData = Object.keys(donutCounts).map((name) => ({
            name: `${name} (${donutTotal > 0 ? ((donutCounts[name] / donutTotal) * 100).toFixed(0) : 0}%)`,
            value: donutCounts[name]
        }));

        // 3. არჩეული სტრატეგიის განსაზღვრა (ზუსტი შესაბამისობა: _id ან სახელი)
        const isAll = !strategy || strategy === "All Strategies" || strategy === "all";
        let targetStrategyDoc = null;
        if (!isAll) {
            targetStrategyDoc =
                strategyById.get(strategy.toString()) ||
                strategyByName.get(strategy.toString().toLowerCase()) ||
                null;
            if (!targetStrategyDoc) {
                return res.json(buildEmptyResponse(strategyDonutData));
            }
        }

        // 4. გაფილტრული ტრეიდები უკვე ბაზის დონეზე
        const tradeMatch = { ...baseMatch };
        if (targetStrategyDoc) tradeMatch.strategy = buildStrategyCondition(targetStrategyDoc);

        const trades = await Trade.find(tradeMatch).sort({ entryDate: 1 }).lean();

        if (trades.length === 0) {
            return res.json(buildEmptyResponse(strategyDonutData));
        }

        // 5. გამოთვლები (ერთი გავლა)
        const daysStructure = {
            Monday: { trades: 0, wins: 0, pnl: 0, rrSum: 0, rrCount: 0 },
            Tuesday: { trades: 0, wins: 0, pnl: 0, rrSum: 0, rrCount: 0 },
            Wednesday: { trades: 0, wins: 0, pnl: 0, rrSum: 0, rrCount: 0 },
            Thursday: { trades: 0, wins: 0, pnl: 0, rrSum: 0, rrCount: 0 },
            Friday: { trades: 0, wins: 0, pnl: 0, rrSum: 0, rrCount: 0 }
        };
        const sessionsStructure = {};
        let totalPnL = 0, winCount = 0, lossCount = 0, winSum = 0, lossSum = 0;
        let bestTrade = null, worstTrade = null;
        let bestTradeSymbol = "N/A", worstTradeSymbol = "N/A";
        let rrSum = 0, rrCount = 0;
        const pnlByDay = {}, pnlByWeek = {}, pnlByMonth = {}, pnlByYear = {};
        const pnls = [];
        let cumulativePnL = 0;
        let runningClosed = 0;
        let runningWins = 0;
        const timelineMap = {};

        trades.forEach((t) => {
            const pnl = toNum(t.pnl);
            const d = new Date(t.entryDate);
            pnls.push(pnl);
            totalPnL += pnl;
            cumulativePnL += pnl;

            // თაიმლაინი: ერთი წერტილი დღეში (ბოლო კუმულატიური მნიშვნელობით)
            // timelineMap[dayKeyOf(d)] = { date: fmtShort(d), pnl: cumulativePnL };

            runningClosed++;
if (pnl > 0) runningWins++;

const dk = dayKeyOf(d);
if (!timelineMap[dk]) {
    timelineMap[dk] = { date: fmtShort(d), "DailyP&L": 0, EquityCurve: 0, WinRate: 0 };
}
timelineMap[dk]["DailyP&L"] = Number((timelineMap[dk]["DailyP&L"] + pnl).toFixed(2));
timelineMap[dk].EquityCurve = Number(cumulativePnL.toFixed(2));
timelineMap[dk].WinRate = Number(((runningWins / runningClosed) * 100).toFixed(1));

            // რეალური პერიოდული ჯამები
            addTo(pnlByDay, dayKeyOf(d), pnl);
            addTo(pnlByWeek, weekStartOf(d).toISOString(), pnl);
            addTo(pnlByMonth, monthKeyOf(d), pnl);
            addTo(pnlByYear, yearKeyOf(d), pnl);

            const rr = toNum(t.riskRewardRatio);
            const hasRR = rr > 0;

            // კვირის დღე
            const dayName = d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
            if (daysStructure[dayName]) {
                const ds = daysStructure[dayName];
                ds.trades++;
                ds.pnl += pnl;
                if (pnl > 0) ds.wins++;
                if (hasRR) { ds.rrSum += rr; ds.rrCount++; }
            }

            // სესია
            const sessionName = t.session || "Other";
            if (!sessionsStructure[sessionName]) {
                sessionsStructure[sessionName] = { trades: 0, wins: 0, losses: 0, pnl: 0, rrSum: 0, rrCount: 0 };
            }
            const ss = sessionsStructure[sessionName];
            ss.trades++;
            ss.pnl += pnl;
            if (pnl > 0) ss.wins++;
            else if (pnl < 0) ss.losses++;
            if (hasRR) { ss.rrSum += rr; ss.rrCount++; }

            if (hasRR) { rrSum += rr; rrCount++; }

            if (pnl > 0) {
                winCount++;
                winSum += pnl;
                if (bestTrade === null || pnl > bestTrade) { bestTrade = pnl; bestTradeSymbol = t.symbol || "N/A"; }
            } else if (pnl < 0) {
                lossCount++;
                lossSum += Math.abs(pnl);
                if (worstTrade === null || pnl < worstTrade) { worstTrade = pnl; worstTradeSymbol = t.symbol || "N/A"; }
            }
        });

        const totalTrades = trades.length; // > 0 გარანტირებულია
        const winRate = (winCount / totalTrades) * 100;
        const avgWin = winCount > 0 ? winSum / winCount : 0;
        const avgLoss = lossCount > 0 ? lossSum / lossCount : 0;
        const profitFactor = lossSum > 0 ? winSum / lossSum : winSum > 0 ? 3 : 0;

        let pfStatus = "POOR";
        if (profitFactor >= 1.5 && profitFactor < 2) pfStatus = "GOOD";
        if (profitFactor >= 2) pfStatus = "EXCELLENT";

        const expectancy = (winRate / 100) * avgWin - ((100 - winRate) / 100) * avgLoss;
        const avgPnL = totalPnL / totalTrades;
        const variance = pnls.reduce((acc, p) => acc + Math.pow(p - avgPnL, 2), 0) / totalTrades;
        const stdDev = Math.sqrt(variance);
        const sharpeRatio = stdDev > 0 ? avgPnL / stdDev : 0;

        // 6. მასივები ფრონტენდისთვის
        const dayPerformanceArray = Object.keys(daysStructure).map((day) => {
            const d = daysStructure[day];
            return {
                day,
                hasTrades: d.trades > 0,
                tradesCount: d.trades,
                winRate: (d.trades > 0 ? (d.wins / d.trades) * 100 : 0).toFixed(1) + "%",
                avgRR: (d.rrCount > 0 ? d.rrSum / d.rrCount : 0).toFixed(2),
                totalPnL: d.pnl.toFixed(2),
                isPositive: d.pnl >= 0
            };
        });

        const sessionPerformanceArray = Object.keys(sessionsStructure).map((session) => {
            const s = sessionsStructure[session];
            return {
                session,
                tradesCount: s.trades,
                winRate: (s.trades > 0 ? (s.wins / s.trades) * 100 : 0).toFixed(1) + "%",
                avgRR: (s.rrCount > 0 ? s.rrSum / s.rrCount : 0).toFixed(2),
                totalPnL: signed(s.pnl),
                isPositive: s.pnl >= 0,
                wins: s.wins,
                losses: s.losses
            };
        });

        // 7. Best Performance: რეალური პერიოდული ჯამებიდან
        const bDay = pickBest(pnlByDay);
        const bWeek = pickBest(pnlByWeek);
        const bMonth = pickBest(pnlByMonth);
        const bYear = pickBest(pnlByYear);

        const weekLabel = bWeek.key
            ? (() => {
                const start = new Date(bWeek.key);
                const end = new Date(start);
                end.setUTCDate(end.getUTCDate() + 6);
                return `${fmtShort(start)} - ${fmtShort(end)}`;
            })()
            : "N/A";
        const monthLabel = bMonth.key
            ? new Date(`${bMonth.key}-01T00:00:00Z`)
                .toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
                .toUpperCase()
            : "N/A";
        const dayLabel = bDay.key ? fmtShort(new Date(`${bDay.key}T00:00:00Z`)) : "N/A";

        let bestSession = "N/A";
        let bestSessionPnL = -Infinity;
        Object.keys(sessionsStructure).forEach((name) => {
            if (sessionsStructure[name].pnl > bestSessionPnL) {
                bestSessionPnL = sessionsStructure[name].pnl;
                bestSession = name;
            }
        });

        // 8. Rule Adherence + აქტიური სტრატეგია (trades უკვე გაფილტრულია ბაზაში)
        let ruleAdherenceList = [];
        let activeStrategyData = null;

        if (targetStrategyDoc) {
            ruleAdherenceList = (targetStrategyDoc.rules || []).map((rule, index) => {
                const checked = trades.filter((t) => Array.isArray(t.checkedRules) && t.checkedRules.includes(rule.ruleId)).length;
                const percentage = (checked / totalTrades) * 100;
                return {
                    displayIndex: index + 1,
                    ruleId: rule.ruleId,
                    text: rule.text,
                    percentage: Math.round(percentage),
                    isPerfect: percentage === 100
                };
            });

          activeStrategyData = {
    strategyName: targetStrategyDoc.strategyName,
    tradesCount: totalTrades,
    wins: winCount,
    losses: lossCount,
    winRate: winRate.toFixed(1) + "%",
    totalPnL: signed(totalPnL),
    avgRR: (rrCount > 0 ? rrSum / rrCount : 0).toFixed(2),
    isPositive: totalPnL >= 0
};
        }

        // 9. პასუხი (ერთადერთი res.json, მის შემდეგ აღარაფერი სრულდება)
        const responsePayload = {
            performanceOverview: {
                totalPnL: signed(totalPnL),
                isPnLPositive: totalPnL >= 0,
                winRate: winRate.toFixed(1) + "%",
                winLossRatioText: `${winCount}W / ${lossCount}L`,
                totalTrades,
                avgWin: `+$${avgWin.toFixed(2)}`,
                bestWinSymbol: bestTradeSymbol,
                avgLoss: `-$${avgLoss.toFixed(2)}`,
                worstLossSymbol: worstTradeSymbol,
                profitFactor: profitFactor.toFixed(2),
                profitFactorStatus: pfStatus
            },
            advancedAnalytics: {
                expectancy: signed(expectancy),
                sharpeRatio: sharpeRatio.toFixed(2),
                bestTrade: `+$${toNum(bestTrade).toFixed(2)}`,
                bestTradeSymbol,
                worstTrade: `-$${Math.abs(toNum(worstTrade)).toFixed(2)}`,
                worstTradeSymbol
            },
            bestPerformance: {
                bestDay: dayLabel,
                bestDayPnL: signed(bDay.value),
                bestWeek: weekLabel,
                bestWeekPnL: signed(bWeek.value),
                bestMonth: monthLabel,
                bestMonthPnL: signed(bMonth.value),
                bestYear: bYear.key || "N/A",
                bestYearPnL: signed(bYear.value),
                bestSession
            },
          charts: {
    timelineData: Object.values(timelineMap),
    donutData: { wins: winCount, losses: lossCount },
    strategyDonutData,
    monthlyData: Object.keys(pnlByMonth).sort().map((key) => ({
        month: new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }),
        fullKey: key,
        pnl: Number(pnlByMonth[key].toFixed(2))
    }))
},
            dayOfWeekPerformance: dayPerformanceArray,
            sessionPerformance: sessionPerformanceArray,
            activeStrategyPerformance: activeStrategyData,
            ruleAdherence: ruleAdherenceList
        };

        return res.json(responsePayload);
    } catch (error) {
        console.error("getAdvancedStatisticsPage error:", error);
        if (!res.headersSent) {
            return res.status(500).json({
                message: "სტატისტიკის გვერდის დათვლის შეცდომა",
                error: error.message
            });
        }
    }
};

exports.getKpiCardsData = async (req, res) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.user);
        const { account } = req.query;
        let queryCondition = { userId };
        if (account) {
            queryCondition.account = new mongoose.Types.ObjectId(account);
        }
        const now = new Date();

        // 1. გამოვთვალოთ მიმდინარე და წინა თვის საწყისი თარიღები (ცვლილების პროცენტისთვის)
        const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

        // 2. წამოვიღოთ იუზერის ყველა თრეიდი ქრონოლოგიურად
        const trades = await Trade.find(queryCondition).sort({ entryDate: 1 });

        if (trades.length === 0) {
            return res.json({
                totalPng: { value: 0, sparkline: [], change: "0%" },
                winRate: { value: "0%", sparkline: [], change: "0%" },
                totalTrades: { value: 0, closedCount: 0, openCount: 0 },
                avgWinLoss: { avgWin: 0, avgLoss: 0, status: "No Trades" }
            });
        }

        // --- ცვლადები მათემატიკისთვის ---
        let totalPnL = 0;
        let totalWins = 0;
        let totalLosses = 0;
        let winPnLSum = 0;
        let lossPnLSum = 0;
        let openTradesCount = 0;
        let closedTradesCount = 0;

        // სპარკლაინების მასივები (კაპიტალის ზრდის ტრეკინგი)
        const pnlSparkline = [];
        const winRateSparkline = [];

        // თვის ცვლილებების დასათვლელი ცვლადები
        let thisMonthWins = 0;
        let thisMonthTrades = 0;
        let lastMonthWins = 0;
        let lastMonthTrades = 0;

        // --- თრეიდების მასივის დამუშავება (Single Pass) ---
        trades.forEach((trade) => {
            const isClosed = trade.status === 'closed';
            const tradeDate = new Date(trade.entryDate);

            if (!isClosed) {
                openTradesCount++;
                return; // ღია თრეიდები ანალიტიკაში არ მონაწილეობს
            }

            closedTradesCount++;
            totalPnL += trade.pnl;
            pnlSparkline.push(totalPnL); // ვამატებთ კუმულატიურ P&L-ს ხაზისთვის

            if (trade.pnl > 0) {
                totalWins++;
                winPnLSum += trade.pnl;
            } else if (trade.pnl < 0) {
                totalLosses++;
                lossPnLSum += trade.pnl;
            }

            // მიმდინარე Win Rate-ის გამოთვლა ყოველ ბიჯზე სპარკლაინის ხაზისთვის
            const currentWinRate = (totalWins / closedTradesCount) * 100;
            winRateSparkline.push(Number(currentWinRate.toFixed(1)));

            // პროცენტული ცვლილების ფილტრაცია თვეების მიხედვით
            if (tradeDate >= thisMonthStart) {
                thisMonthTrades++;
                if (trade.pnl > 0) thisMonthWins++;
            } else if (tradeDate >= lastMonthStart && tradeDate < thisMonthStart) {
                lastMonthTrades++;
                if (trade.pnl > 0) lastMonthWins++;
            }
        });

        // --- საბოლოო მეტრიკების გამოთვლა ---
        const finalWinRate = closedTradesCount > 0 ? (totalWins / closedTradesCount) * 100 : 0;
        const avgWin = totalWins > 0 ? winPnLSum / totalWins : 0;
        const avgLoss = totalLosses > 0 ? Math.abs(lossPnLSum / totalLosses) : 0;

        // Win Rate ცვლილების პროცენტი წინა თვესთან შედარებით (↗ +2.3%)
        const thisMonthWR = thisMonthTrades > 0 ? (thisMonthWins / thisMonthTrades) * 100 : 0;
        const lastMonthWR = lastMonthTrades > 0 ? (lastMonthWins / lastMonthTrades) * 100 : 0;
        const wrChange = thisMonthWR - lastMonthWR;
        const wrChangeText = wrChange >= 0 ? `↗ +${wrChange.toFixed(1)}%` : `↘ ${wrChange.toFixed(1)}%`;

        // R:R სტატუსის განსაზღვრა (⚠️ Review R:R)
        let rrStatus = "Good R:R";
        if (avgLoss > avgWin && closedTradesCount > 0) {
            rrStatus = "Review R:R";
        } else if (closedTradesCount === 0) {
            rrStatus = "No Closed Trades";
        }

        // 3. ვაბრუნებთ იდეალურ სტრუქტურას ფრონტენდისთვის
        res.json({
            totalPnL: {
                value: totalPnL.toFixed(2),
                sparkline: pnlSparkline, // გადაეცემა <LineChart />-ს
                isPositive: totalPnL >= 0
            },
            winRate: {
                value: finalWinRate.toFixed(1) + "%",
                sparkline: winRateSparkline, // გადაეცემა <LineChart />-ს
                change: wrChangeText,
                isPositive: wrChange >= 0
            },
            totalTrades: {
                value: closedTradesCount + openTradesCount,
                closedCount: closedTradesCount,
                openCount: openTradesCount,
                statusText: `${closedTradesCount} CLOSED`
            },
            avgWinLoss: {
                avgWin: `$${avgWin.toFixed(2)}`,
                avgLoss: `$${avgLoss.toFixed(2)}`,
                status: rrStatus, // მაგ: "Review R:R"
                isWarning: avgLoss > avgWin
            }
        });

    } catch (error) {
        res.status(500).json({ message: 'KPI ბარათების მონაცემების დათვლის შეცდომა', error: error.message });
    }
};

// exports.getPerformanceOverviewChart = async (req, res) => {
//     try {
//         const userId = new mongoose.Types.ObjectId(req.user);

//         const { account } = req.query; // 🚀 ვიღებთ ექაუნთს

//         let queryCondition = { userId, status: 'closed' };
//         if (account) {
//             queryCondition.account = new mongoose.Types.ObjectId(account);
//         }

//         // 🚀 1. ვფილტრავთ მხოლოდ დახურულ ტრეიდებს (status: 'closed')
//         const trades = await Trade.find(queryCondition).sort({ entryDate: 1 });

//         if (trades.length === 0) {
//             return res.json([]);
//         }

//         const chartDataMap = {};
//         let cumulativePnL = 0;
//         let totalWins = 0;
//         let totalClosed = 0;

//         trades.forEach((trade) => {
//             const dateKey = new Date(trade.entryDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

//             totalClosed++;
//             if (trade.pnl > 0) totalWins++;
//             cumulativePnL += trade.pnl;

//             // თუ ამ დღეზე ჩანაწერი ჯერ არ არსებობს, ვქმნით სტრუქტურას
//             if (!chartDataMap[dateKey]) {
//                 chartDataMap[dateKey] = {
//                     date: dateKey,
//                     "DailyP&L": 0,      // 🚀 გასწორდა ფრონტენდის თაბის (DailyP&L) შესაბამისად
//                     "EquityCurve": 0,    // 🚀 გასწორდა ფრონტენდის თაბის (EquityCurve) შესაბამისად
//                     "WinRate": 0         // 🚀 გასწორდა ფრონტენდის თაბის (WinRate) შესაბამისად
//                 };
//             }

//             // ვაახლებთ მონაცემებს კონკრეტული დღისთვის
//             chartDataMap[dateKey]["DailyP&L"] += trade.pnl;
//             chartDataMap[dateKey]["EquityCurve"] = cumulativePnL;
//             chartDataMap[dateKey]["WinRate"] = Number(((totalWins / totalClosed) * 100).toFixed(1));
//         });

//         const finalChartData = Object.values(chartDataMap);
//         res.json(finalChartData);
//     } catch (error) {
//         res.status(500).json({ message: 'გრაფიკის მონაცემების დათვლის შეცდომა', error: error.message });
//     }
// };


exports.getPerformanceOverviewChart = async (req, res) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.user);
        const { account, range } = req.query;
        const tz = isValidTz(req.query.tz) ? req.query.tz : "UTC";
        const days = RANGE_DAYS[range]; // undefined = ყველა დრო

        const queryCondition = { userId, status: "closed" };
        if (account && mongoose.Types.ObjectId.isValid(account)) {
            queryCondition.account = new mongoose.Types.ObjectId(account);
        }

        const now = new Date();
        let startKey = "0000-00-00";
        if (days) {
            // ერთი დღე მარაგით, ზუსტი ჭრა ქვემოთ ხდება ლოკალური დღის გასაღებით
            queryCondition.entryDate = { $gte: new Date(now.getTime() - (days + 1) * 86400000) };
            startKey = dayKeyInTz(new Date(now.getTime() - (days - 1) * 86400000), tz);
        }

        const trades = await Trade.find(queryCondition).sort({ entryDate: 1 }).lean();

        const labelOpts = { month: "short", day: "numeric", timeZone: tz };
        if (days && days > 180) labelOpts.year = "2-digit"; // 1Y-ზე ერთნაირი თარიღები არ აირევა

        const round2 = (n) => Number(n.toFixed(2));
        const chartMap = {};
        let cumulativePnL = 0;
        let totalWins = 0;
        let totalClosed = 0;

        trades.forEach((t) => {
            const d = new Date(t.entryDate);
            const key = dayKeyInTz(d, tz);
            if (key < startKey) return;

            const pnl = Number(t.pnl) || 0;
            totalClosed++;
            if (pnl > 0) totalWins++;
            cumulativePnL += pnl;

            if (!chartMap[key]) {
                chartMap[key] = {
                    date: d.toLocaleDateString("en-US", labelOpts),
                    "DailyP&L": 0,
                    EquityCurve: 0,
                    WinRate: 0
                };
            }
            chartMap[key]["DailyP&L"] = round2(chartMap[key]["DailyP&L"] + pnl);
            chartMap[key].EquityCurve = round2(cumulativePnL);
            chartMap[key].WinRate = Number(((totalWins / totalClosed) * 100).toFixed(1));
        });

        // YYYY-MM-DD გასაღებები ქრონოლოგიურად ლაგდება
        res.json(Object.keys(chartMap).sort().map((k) => chartMap[k]));
    } catch (error) {
        console.error("getPerformanceOverviewChart error:", error);
        if (!res.headersSent) {
            res.status(500).json({ message: "გრაფიკის მონაცემების დათვლის შეცდომა", error: error.message });
        }
    }
};










// სექცია 6: Performance Score და 6-კუთხა Radar Chart
exports.getPerformanceScoreData = async (req, res) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.user);
        const { account } = req.query; // 🚀 ვიღებთ ექაუნთს

        let queryCondition = { userId };
        if (account) {
            queryCondition.account = new mongoose.Types.ObjectId(account);
        }

        // წამოვიღოთ დახურული თრეიდები

        const trades = await Trade.find(queryCondition);

        if (trades.length === 0) {
            return res.json({
                performanceScore: 0,
                radarData: [
                    { name: "Win %", value: 0 },
                    { name: "Profit factor", value: 0 },
                    { name: "Avg win/loss", value: 0 },
                    { name: "Recovery factor", value: 0 },
                    { name: "Max drawdown", value: 0 },
                    { name: "Consistency", value: 0 }
                ]
            });
        }

        let totalPnL = 0;
        let winSum = 0;
        let lossSum = 0;
        let winCount = 0;
        let totalRulesChecked = 0;
        let totalRulesPossible = 0;

        // დრაუდაუნის მარტივი ტრეკინგისთვის კაპიტალის პიკი
        let peakBalance = 0;
        let currentBalance = 0;
        let maxDrawdownValue = 0;

        trades.forEach(t => {
            totalPnL += t.pnl;
            currentBalance += t.pnl;

            // Max Drawdown მათემატიკა
            if (currentBalance > peakBalance) peakBalance = currentBalance;
            const drawdown = peakBalance - currentBalance;
            if (drawdown > maxDrawdownValue) maxDrawdownValue = drawdown;

            if (t.pnl > 0) {
                winSum += t.pnl;
                winCount++;
            } else {
                lossSum += Math.abs(t.pnl);
            }

            // სტაბილურობის დათვლა წესების მიხედვით
            totalRulesChecked += t.checkedRules ? t.checkedRules.length : 0;
            // უბრალოდ ვუშვებთ, რომ საშუალოდ თრეიდს 4 ოპტიმალური წესი უნდა ჰქონდეს შემოწმებული
            totalRulesPossible += 4;
        });

        const totalTrades = trades.length;

        // 1. მეტრიკების რეალური გამოთვლა
        const winRate = (winCount / totalTrades) * 100;
        const profitFactor = lossSum > 0 ? winSum / lossSum : winSum > 0 ? 3 : 0;
        const avgWin = winCount > 0 ? winSum / winCount : 0;
        const avgLoss = (totalTrades - winCount) > 0 ? lossSum / (totalTrades - winCount) : 0;
        const avgWinLossRatio = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? 2 : 0;
        const recoveryFactor = maxDrawdownValue > 0 ? winSum / maxDrawdownValue : winSum > 0 ? 3 : 0;
        const consistencyScore = totalRulesPossible > 0 ? (totalRulesChecked / totalRulesPossible) * 100 : 0;

        // 2. თითოეული ინდიკატორის კონვერტაცია 100-ქულიან სისტემაში (რადარის ვიზუალისთვის)
        const winRateScore = Math.min(winRate, 100);
        const pfScore = Math.min((profitFactor / 3) * 100, 100); // 3+ არის 100 ქულა
        const wlScore = Math.min((avgWinLossRatio / 2) * 100, 100); // 2:1 R:R არის 100 ქულა
        const rfScore = Math.min((recoveryFactor / 3) * 100, 100);
        const ddScore = peakBalance > 0 ? Math.max(0, 100 - (maxDrawdownValue / peakBalance) * 100) : 100; // ნაკლები დრაუდაუნი = მეტი ქულა
        const constScore = Math.min(consistencyScore, 100);

        // 3. გლობალური Performance Score (ამ 6 ქულის საშუალო არითმეტიკული)
        const finalPerformanceScore = (winRateScore + pfScore + wlScore + rfScore + ddScore + constScore) / 6;

        // 4. ვაბრუნებთ ფორმატს, რომელსაც პირდაპირ ჭამს <RadarChart /> კომპონენტი
        res.json({
            performanceScore: Number(finalPerformanceScore.toFixed(2)), // გამოჩნდება დიდ ციფრად (მაგ: 35.00)
            radarData: [
                { name: "Win %", value: Number(winRateScore.toFixed(0)) },
                { name: "Profit factor", value: Number(pfScore.toFixed(0)) },
                { name: "Avg win/loss", value: Number(wlScore.toFixed(0)) },
                { name: "Recovery factor", value: Number(rfScore.toFixed(0)) },
                { name: "Max drawdown", value: Number(ddScore.toFixed(0)) },
                { name: "Consistency", value: Number(constScore.toFixed(0)) }
            ]
        });

    } catch (error) {
        res.status(500).json({ message: 'Performance Score-ის დათვლის შე成ზღუდვა', error: error.message });
    }
};


// სექცია 4: Trading Activity (კალენდარული Heatmap-ის მონაცემები)
exports.getTradingActivityHeatmap = async (req, res) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.user);
        const { account } = req.query;

        let matchStage = { userId, status: 'closed' };

        // 🚀 უსაფრთხო შემოწმება: მხოლოდ მაშინ ვფილტრავთ, თუ ვალიდური ObjectId სტრინგია
        if (account && mongoose.Types.ObjectId.isValid(account)) {
            matchStage.account = new mongoose.Types.ObjectId(account);
        }

        const activity = await Trade.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$entryDate" } },
                    dailyPnL: { $sum: "$pnl" },
                    tradesCount: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        let activeDays = activity.length;
        let winDays = 0;
        let lossDays = 0;

        activity.forEach(day => {
            if (day.dailyPnL > 0) winDays++;
            if (day.dailyPnL < 0) lossDays++;
        });

        res.json({
            stats: {
                activeDays,
                winDays,
                lossDays
            },
            heatmapData: activity.map(day => ({
                date: day._id,
                count: day.tradesCount,
                pnl: day.dailyPnL,
                status: day.dailyPnL > 0 ? "Win" : day.dailyPnL < 0 ? "Loss" : "Breakeven"
            }))
        });

    } catch (error) {
        res.status(500).json({ message: 'კალენდრის მონაცემების დათვლის შეცდომა', error: error.message });
    }
};


// სექცია 7: სრული თვიური კალენდრის მონაცემები
exports.getCalendarMonthData = async (req, res) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.user);
        const { account, year = 2026, month = 10 } = req.query; // ნაგულისხმევად ოქტომბერი

        // განვსაზღვროთ თვის დაწყების და დასრულების თარიღები
        const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
        const endDate = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59, 999);

        let matchStage = {
            userId,
            status: 'closed',
            entryDate: { $gte: startDate, $lte: endDate }
        };

        // თუ არჩეულია კონკრეტული სავაჭრო ანგარიში
        if (account) {
            matchStage.account = new mongoose.Types.ObjectId(account);
        }

        const calendarData = await Trade.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$entryDate" } },
                    dailyPnL: { $sum: "$pnl" },
                    tradesCount: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // გამოვთვალოთ ზედა პანელის თვიური ჯამები (TRADES: 7, P&L: +$275.00, WIN: 57%)
        const allMonthTrades = await Trade.find(matchStage);
        let totalPnL = 0;
        let winCount = 0;

        allMonthTrades.forEach(t => {
            totalPnL += t.pnl;
            if (t.pnl > 0) winCount++;
        });

        const winRate = allMonthTrades.length > 0 ? (winCount / allMonthTrades.length) * 100 : 0;

        res.json({
            monthSummary: {
                totalTrades: allMonthTrades.length,
                totalPnL: (totalPnL >= 0 ? "+$" : "-$") + Math.abs(totalPnL).toFixed(2),
                winRate: winRate.toFixed(0) + "%",
                isPositive: totalPnL >= 0
            },
            days: calendarData.map(d => ({
                date: d._id, // მაგ: "2026-10-13"
                dayNumber: new Date(d._id).getDate(),
                pnl: d.dailyPnL,
                tradesCount: d.tradesCount,
                status: d.dailyPnL > 0 ? "Win" : d.dailyPnL < 0 ? "Loss" : "Breakeven"
            }))
        });

    } catch (error) {
        res.status(500).json({ message: 'კალენდრის თვის მონაცემების დათვლის შეცდომა', error: error.message });
    }
};


// ==========================================
// analyticscontroller.js — ნაწილი 1 (ბექენდი)
// ==========================================


// exports.getAdvancedStatisticsPage = async (req, res) => {
//     try {
//          const userId = new mongoose.Types.ObjectId(req.user);
//         const { account, strategy, timeframe = "30 days" } = req.query;

//         let matchStage = { userId: userId, status: "closed" };

//         if (account && mongoose.Types.ObjectId.isValid(account)) {
//             matchStage.account = new mongoose.Types.ObjectId(account);
//         }

//         let queryBuilder = Trade.find(matchStage).sort({ entryDate: 1 });

//         const now = new Date();
//         if (timeframe === "7 days") {
//             const dateCopy = new Date(now.getTime());
//             dateCopy.setDate(dateCopy.getDate() - 7);
//             queryBuilder = queryBuilder.where("entryDate").gte(dateCopy);
//         }
//         if (timeframe === "30 days") {
//             const dateCopy = new Date(now.getTime());
//             dateCopy.setDate(dateCopy.getDate() - 30);
//             queryBuilder = queryBuilder.where("entryDate").gte(dateCopy);
//         }

//         let trades = await queryBuilder;
//         const allUserStrategies = await Strategy.find({ userId: userId });

//         // 🚀 ნაბიჯი 1: სტრატეგიით ფილტრაცია გადმოვიდა აქ (შემოწმების ზემოთ!)
//         let targetStrategyDoc = null;
//         if (strategy && strategy !== "All Strategies" && strategy !== "all") {
//             if (mongoose.Types.ObjectId.isValid(strategy)) {
//                 targetStrategyDoc = allUserStrategies.find(s => s._id.toString() === strategy.toString());
//             }

//             if (targetStrategyDoc) {
//                 const currentStratName = targetStrategyDoc.strategyName.toLowerCase();
//                 const targetStratIdStr = targetStrategyDoc._id.toString().toLowerCase();
//                 const baseName = currentStratName.split(" ")[0];

//                 trades = trades.filter(t => {
//                     const tStratStr = t.strategy ? t.strategy.toString().toLowerCase() : "";
//                     return tStratStr === targetStratIdStr || tStratStr === currentStratName || tStratStr.includes(baseName);
//                 });
//             } else {
//                 trades = trades.filter(t => t.strategy && t.strategy.toString().toLowerCase() === strategy.toLowerCase());
//             }
//         }

//         // 🚀 ნაბიჯი 2: ახლა უკვე უსაფრთხოა შემოწმება. თუ გაფილტვრის მერე მასივი ცარიელია, აქვე სრულდება ფუნქცია!
//         if (!trades || trades.length === 0) {
//             return res.json({
//                 performanceOverview: { totalPnL: "$0.00", isPnLPositive: true, winRate: "0.0%", winLossRatioText: "0W / 0L", totalTrades: 0, avgWin: "$0.00", bestWinSymbol: "N/A", avgLoss: "$0.00", worstLossSymbol: "N/A", profitFactor: "0.00", profitFactorStatus: "POOR" },
//                 advancedAnalytics: { expectancy: "$0.00", sharpeRatio: "0.00", bestTrade: "$0.00", bestTradeSymbol: "N/A", worstTrade: "$0.00", worstTradeSymbol: "N/A" },
//                 bestPerformance: { bestDay: "N/A", bestDayPnL: "$0.00", bestWeek: "N/A", bestWeekPnL: "$0.00", bestMonth: "N/A", bestMonthPnL: "$0.00", bestYear: "N/A", bestYearPnL: "$0.00", bestSession: "N/A" },
//                 charts: { timelineData: [], donutData: { wins: 0, losses: 0 }, strategyDonutData: [] },
//                 dayOfWeekPerformance: [],
//                 sessionPerformance: [],
//                 activeStrategyPerformance: null,
//                 ruleAdherence: []
//             });
//         }

//         // სტრუქტურები გამოთვლებისთვის
//         const daysStructure = {
//             "Monday": { trades: 0, wins: 0, pnl: 0, rrSum: 0, rrCount: 0 },
//             "Tuesday": { trades: 0, wins: 0, pnl: 0, rrSum: 0, rrCount: 0 },
//             "Wednesday": { trades: 0, wins: 0, pnl: 0, rrSum: 0, rrCount: 0 },
//             "Thursday": { trades: 0, wins: 0, pnl: 0, rrSum: 0, rrCount: 0 },
//             "Friday": { trades: 0, wins: 0, pnl: 0, rrSum: 0, rrCount: 0 }
//         };

//         const sessionsStructure = {};
//         const strategyBreakdownMap = {};

//         let totalPnL = 0;
//         let winCount = 0;
//         let lossCount = 0;
//         let winSum = 0;
//         let lossSum = 0;
//         let bestTrade = null; // ნულიდან Infinity-ს პრობლემის ასაცილებლად
//         let worstTrade = null;
//         let bestTradeSymbol = "N/A";
//         let worstTradeSymbol = "N/A";

//         // რეალური პერიოდების გამოთვლის დამხმარე ობიექტები
//         const pnlByDayDate = {};
//         const performanceTimeline = [];
//         let cumulativePnL = 0;

//         // ==========================================
//         // analyticscontroller.js — ნაწილი 2 (ბექენდი)
//         // ==========================================
//         trades.forEach(t => {
//             let stratName = "Unknown";
//             if (t.strategy) {
//                 const matchStrat = allUserStrategies.find(s =>
//                     s._id.toString() === t.strategy.toString() ||
//                     s.strategyName.toLowerCase() === t.strategy.toString().toLowerCase()
//                 );
//                 stratName = matchStrat ? matchStrat.strategyName : t.strategy.toString();
//             }

//             const currentPnL = t.pnl || 0;
//             totalPnL += currentPnL;
//             cumulativePnL += currentPnL;

//             // თაიმლაინის ჩარტისთვის
//             const formattedDate = new Date(t.entryDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
//             performanceTimeline.push({ date: formattedDate, pnl: cumulativePnL });

//             // კონკრეტული კალენდარული დღის რეალური მოგება-წაგების დაჯამება საუკეთესო დღის საპოვნელად
//             const calendarDayStr = new Date(t.entryDate).toDateString();
//             pnlByDayDate[calendarDayStr] = (pnlByDayDate[calendarDayStr] || 0) + currentPnL;

//             // კვირის დღეების ანალიტიკა
//             const dayName = new Date(t.entryDate).toLocaleDateString('en-US', { weekday: 'long' });
//             if (daysStructure[dayName]) {
//                 daysStructure[dayName].trades++;
//                 daysStructure[dayName].pnl += currentPnL;
//                 if (currentPnL > 0) daysStructure[dayName].wins++;
//                 if (t.riskRewardRatio) {
//                     daysStructure[dayName].rrSum += t.riskRewardRatio;
//                     daysStructure[dayName].rrCount++;
//                 }
//             }

//             // სესიების ანალიტიკა
//             const sessionName = t.session || "Other";
//             if (!sessionsStructure[sessionName]) {
//                 sessionsStructure[sessionName] = { trades: 0, wins: 0, losses: 0, pnl: 0, rrSum: 0, rrCount: 0 };
//             }
//             sessionsStructure[sessionName].trades++;
//             sessionsStructure[sessionName].pnl += currentPnL;
//             if (currentPnL > 0) sessionsStructure[sessionName].wins++;
//             else if (currentPnL < 0) sessionsStructure[sessionName].losses++;
//             if (t.riskRewardRatio) {
//                 sessionsStructure[sessionName].rrSum += t.riskRewardRatio;
//                 sessionsStructure[sessionName].rrCount++;
//             }

//             // სტრატეგიების განაწილება
//             if (!strategyBreakdownMap[stratName]) {
//                 strategyBreakdownMap[stratName] = { trades: 0, wins: 0, pnl: 0, rrSum: 0, rrCount: 0 };
//             }
//             strategyBreakdownMap[stratName].trades++;
//             strategyBreakdownMap[stratName].pnl += currentPnL;
//             if (currentPnL > 0) strategyBreakdownMap[stratName].wins++;
//             if (t.riskRewardRatio) {
//                 strategyBreakdownMap[stratName].rrSum += t.riskRewardRatio;
//                 strategyBreakdownMap[stratName].rrCount++;
//             }

//             // საუკეთესო და უარესი თრეიდის გამოთვლა (უსაფრთხო ლოგიკით)
//             if (currentPnL > 0) {
//                 winCount++;
//                 winSum += currentPnL;
//                 if (bestTrade === null || currentPnL > bestTrade) {
//                     bestTrade = currentPnL;
//                     bestTradeSymbol = t.symbol || "N/A";
//                 }
//             } else if (currentPnL < 0) {
//                 lossCount++;
//                 lossSum += Math.abs(currentPnL);
//                 if (worstTrade === null || currentPnL < worstTrade) {
//                     worstTrade = currentPnL;
//                     worstTradeSymbol = t.symbol || "N/A";
//                 }
//             }
//         });

//         // 4. მათემატიკური აგრეგაცია
//         const totalTrades = trades.length;
//         const winRate = totalTrades > 0 ? (winCount / totalTrades) * 100 : 0;
//         const avgWin = winCount > 0 ? winSum / winCount : 0;
//         const avgLoss = lossCount > 0 ? lossSum / lossCount : 0;
//         const profitFactor = lossSum > 0 ? winSum / lossSum : winSum > 0 ? 3 : 0;

//         let pfStatus = "POOR";
//         if (profitFactor >= 1.5 && profitFactor < 2) pfStatus = "GOOD";
//         if (profitFactor >= 2) pfStatus = "EXCELLENT";

//         const expectancy = ((winRate / 100) * avgWin) - (((100 - winRate) / 100) * avgLoss);
//         const avgPnL = totalTrades > 0 ? totalPnL / totalTrades : 0;
//         const variance = totalTrades > 0 ? trades.reduce((acc, t) => acc + Math.pow((t.pnl || 0) - avgPnL, 2), 0) / totalTrades : 0;
//         const stdDev = Math.sqrt(variance) || 1;
//         const sharpeRatio = (avgPnL / stdDev).toFixed(2);

//         // მასივების ფორმირება ფრონტენდის კომპონენტებისთვის
//         const dayPerformanceArray = Object.keys(daysStructure).map(day => {
//             const d = daysStructure[day];
//             return {
//                 day,
//                 hasTrades: d.trades > 0,
//                 tradesCount: d.trades,
//                 winRate: (d.trades > 0 ? (d.wins / d.trades) * 100 : 0).toFixed(1) + "%",
//                 avgRR: (d.rrCount > 0 ? d.rrSum / d.rrCount : 0).toFixed(2),
//                 totalPnL: d.pnl.toFixed(2),
//                 isPositive: d.pnl >= 0
//             };
//         });

//         const sessionPerformanceArray = Object.keys(sessionsStructure).map(session => {
//             const s = sessionsStructure[session];
//             return {
//                 session,
//                 tradesCount: s.trades,
//                 winRate: (s.trades > 0 ? (s.wins / s.trades) * 100 : 0).toFixed(1) + "%",
//                 avgRR: (s.rrCount > 0 ? s.rrSum / s.rrCount : 0).toFixed(2),
//                 totalPnL: (s.pnl >= 0 ? "+" : "-") + Math.abs(s.pnl).toFixed(2),
//                 isPositive: s.pnl >= 0,
//                 wins: s.wins,
//                 losses: s.losses
//             };
//         });

//         // 🚀 რეალური საუკეთესო კალენდარული დღის პოვნა
//         let bestDayName = "N/A";
//         let bestDayValue = -Infinity;
//         Object.keys(pnlByDayDate).forEach(dateKey => {
//             if (pnlByDayDate[dateKey] > bestDayValue) {
//                 bestDayValue = pnlByDayDate[dateKey];
//                 bestDayName = new Date(dateKey).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
//             }
//         });
//         if (bestDayValue === -Infinity) bestDayValue = 0;

//         const bestSession = sessionPerformanceArray.reduce((a, b) =>
//             parseFloat(a.totalPnL.replace(/[^0-9.-]/g, '')) > parseFloat(b.totalPnL.replace(/[^0-9.-]/g, '')) ? a : b,
//             { session: "N/A", totalPnL: "$0" }
//         ).session;

//         // 5. წესების დაცვა (Rule Adherence) და კონკრეტული სტრატეგიის დეტალები
//         let ruleAdherenceList = [];
//         let activeStrategyData = null;

//         if (targetStrategyDoc) {
//             const currentStratName = targetStrategyDoc.strategyName;

//             ruleAdherenceList = targetStrategyDoc.rules.map((rule, index) => {
//                 const checkedCount = trades.filter(t => t.checkedRules && t.checkedRules.includes(rule.ruleId)).length;
//                 const percentage = trades.length > 0 ? (checkedCount / trades.length) * 100 : 0;

//                 return {
//                     displayIndex: index + 1,
//                     ruleId: rule.ruleId,
//                     text: rule.text,
//                     percentage: Math.round(percentage),
//                     isPerfect: percentage === 100
//                 };
//             });

//             const sData = strategyBreakdownMap[currentStratName] || { trades: 0, wins: 0, pnl: 0, rrSum: 0, rrCount: 0 };
//             activeStrategyData = {
//                 strategyName: currentStratName,
//                 tradesCount: trades.length,
//                 winRate: trades.length > 0 ? ((trades.filter(t => t.pnl > 0).length / trades.length) * 100).toFixed(1) + "%" : "0.0%",
//                 totalPnL: (totalPnL >= 0 ? "+" : "-") + Math.abs(totalPnL).toFixed(2),
//                 avgRR: (sData.rrCount > 0 ? sData.rrSum / sData.rrCount : 0).toFixed(2),
//                 isPositive: totalPnL >= 0
//             };
//         }

//         const strategyDonutData = Object.keys(strategyBreakdownMap).map(name => {
//             const totalStratTrades = strategyBreakdownMap[name].trades;
//             const percentOfTotal = totalTrades > 0 ? (totalStratTrades / totalTrades) * 100 : 0;
//             return {
//                 name: `${name} (${percentOfTotal.toFixed(0)}%)`,
//                 value: totalStratTrades
//             };
//         });

//         // 6. საბოლოო პასუხი ფრონტენდს
//         res.json({
//             performanceOverview: {
//                 totalPnL: (totalPnL >= 0 ? "+" : "-") + Math.abs(totalPnL).toFixed(2),
//                 isPnLPositive: totalPnL >= 0,
//                 winRate: winRate.toFixed(1) + "%",
//                 winLossRatioText: `${winCount}W / ${lossCount}L`,
//                 totalTrades,
//                 avgWin: `+$${avgWin.toFixed(2)}`,
//                 bestWinSymbol: bestTradeSymbol,
//                 avgLoss: `-$${avgLoss.toFixed(2)}`,
//                 worstLossSymbol: worstTradeSymbol,
//                 profitFactor: profitFactor.toFixed(2),
//                 profitFactorStatus: pfStatus
//             },
//             advancedAnalytics: {
//                 expectancy: (expectancy >= 0 ? "+" : "-") + Math.abs(expectancy).toFixed(2),
//                 sharpeRatio,
//                 bestTrade: `+$${(bestTrade || 0).toFixed(2)}`,
//                 bestTradeSymbol,
//                 worstTrade: `-$${Math.abs(worstTrade || 0).toFixed(2)}`,
//                 worstTradeSymbol
//             },
//             bestPerformance: {
//                 bestDay: bestDayName,
//                 bestDayPnL: (bestDayValue >= 0 ? "+" : "-") + Math.abs(bestDayValue).toFixed(2),
//                 bestWeek: "Current Period",
//                 bestWeekPnL: (totalPnL >= 0 ? "+" : "-") + Math.abs(totalPnL).toFixed(2),
//                 bestMonth: new Date().toLocaleString('en-US', { month: 'long' }).toUpperCase(),
//                 bestMonthPnL: (totalPnL >= 0 ? "+" : "-") + Math.abs(totalPnL).toFixed(2),
//                 bestYear: new Date().getFullYear().toString(),
//                 bestYearPnL: (totalPnL >= 0 ? "+" : "-") + Math.abs(totalPnL).toFixed(2),
//                 bestSession
//             },
//             charts: {
//                 timelineData: performanceTimeline,
//                 donutData: { wins: winCount, losses: lossCount },
//                 strategyDonutData
//             },
//             dayOfWeekPerformance: dayPerformanceArray,
//             sessionPerformance: sessionPerformanceArray,
//             activeStrategyPerformance: activeStrategyData,
//             ruleAdherence: ruleAdherenceList
//         });

//         console.log("========================================");
//         console.log("🔥 FULL BACKEND RESPONSE TO CLIENT:");
//         console.log(JSON.stringify(responsePayload, null, 2));
//         console.log("========================================");


        
//     } catch (error) {
//         res.status(500).json({ message: 'სტატისტიკის გვერდის დათვლის შეცდომა', error: error.message });
//     }
// };


