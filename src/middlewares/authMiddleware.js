const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  // ჰედერიდან ტოკენის წამოღება (ფორმატი: Bearer TOKEN_HERE)
  const authHeader = req.header('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'წვდომა უარყოფილია, ტოკენი არ არსებობს' });
  }

  const token = authHeader.split(' ')[1];

  try {
    // ტოკენის ვერიფიკაცია .env-ში არსებული საიდუმლო გასაღებით
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // რექვესტს ვამატებთ იუზერის ID-ს, რომ კონტროლერებმა იცოდნენ, ვინ აკეთებს მოთხოვნას
    req.user = decoded.userId;
    next();
  } catch (error) {
    res.status(401).json({ message: 'ტოკენი არ არის ვალიდური' });
  }
};
