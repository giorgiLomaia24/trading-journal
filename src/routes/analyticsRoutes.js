const express = require('express');
const router = express.Router();
const { getKpiCardsData,
    getPerformanceOverviewChart,
    getPerformanceScoreData,
    getTradingActivityHeatmap,
    getCalendarMonthData,
     getAdvancedStatisticsPage 
} = require('../controllers/analyticsController');
const authMiddleware = require('../middlewares/authMiddleware');

// ენდპოინტი დაცულია ტოკენით
router.get('/kpi-cards', authMiddleware, getKpiCardsData);
router.get('/performance-chart', authMiddleware, getPerformanceOverviewChart); 
router.get('/performance-score', authMiddleware, getPerformanceScoreData);
router.get('/heatmap', authMiddleware, getTradingActivityHeatmap);
router.get('/calendar', authMiddleware, getCalendarMonthData);
router.get('/advanced-stats', authMiddleware, getAdvancedStatisticsPage);

module.exports = router;
