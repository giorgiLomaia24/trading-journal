const Session = require('../models/Session');

const MAX_NAME_LENGTH = 30;

// 1. READ ALL: მომხმარებლის ყველა სავაჭრო სესია (შექმნის თანმიმდევრობით)
exports.getSessions = async (req, res) => {
  try {
    const sessions = await Session.find({ userId: req.user }).sort({ createdAt: 1 }).lean();
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ message: 'სერვერის შეცდომა სესიების წამოღებისას', error: error.message });
  }
};

// 2. CREATE: ახალი სავაჭრო სესიის შექმნა (მხოლოდ სახელი)
exports.createSession = async (req, res) => {
  try {
    const raw = req.body.sessionName;
    // ზედმეტი ინტერვალები ერთ ინტერვალად: "NY   AM " -> "NY AM"
    const name = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';

    if (!name) {
      return res.status(400).json({ message: 'სესიის სახელი სავალდებულოა' });
    }
    if (name.length > MAX_NAME_LENGTH) {
      return res.status(400).json({ message: `სახელი მაქსიმუმ ${MAX_NAME_LENGTH} სიმბოლო უნდა იყოს` });
    }

    const nameKey = name.toLowerCase();

    const existing = await Session.findOne({ userId: req.user, nameKey });
    if (existing) {
      return res.status(409).json({ message: 'ასეთი სახელის სესია უკვე არსებობს' });
    }

    const session = await Session.create({
      userId: req.user,
      sessionName: name,
      nameKey
    });

    res.status(201).json(session);
  } catch (error) {
    // პარალელური მოთხოვნისას unique ინდექსი იჭერს დუბლიკატს
    if (error.code === 11000) {
      return res.status(409).json({ message: 'ასეთი სახელის სესია უკვე არსებობს' });
    }
    res.status(500).json({ message: 'სერვერის შეცდომა სესიის შექმნისას', error: error.message });
  }
};