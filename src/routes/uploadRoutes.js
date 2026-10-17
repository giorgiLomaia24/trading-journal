const express = require('express');
const router = express.Router();
const upload = require('../config/cloudinary');
const authMiddleware = require('../middlewares/authMiddleware');
const User = require('../models/User');

// 1. თრეიდის სქრინშოტების ატვირთვა (მაქსიმუმ 6 ფოტო ერთდროულად)
router.post('/trade-images', authMiddleware, upload.array('images', 6), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'ფაილები არ არის ატვირთული' });
    }

    // ვაგროვებთ ატვირთული ფოტოების ონლაინ ლინკებს (URL) მასივში
    const imageUrls = req.files.map(file => file.path);
    
    // ვუბრუნებთ ლინკებს ფრონტენდს, რომელსაც მერე Trade-ის შექმნისას ბოდიში გააყოლებს
    res.json({ imageUrls });
  } catch (error) {
    res.status(500).json({ message: 'ფაილების ატვირთვის შეცდომა', error: error.message });
  }
});

// 2. მომხმარებლის პროფილის ფოტოს ატვირთვა (Change Photo [image_NIulD8.png])
router.post('/profile-avatar', authMiddleware, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'ფაილი არ არის ატვირთული' });
    }

    const avatarUrl = req.file.path;

    // პირდაპირ ბაზაშივე განვუახლოთ იუზერს ავატარის ლინკი
    await User.findByIdAndUpdate(req.user, { $set: { avatar: avatarUrl } });

    res.json({ message: 'პროფილის ფოტო წარმატებით განახლდა', avatarUrl });
  } catch (error) {
    res.status(500).json({ message: 'ავატარის ატვირთვის შეცდომა', error: error.message });
  }
});

module.exports = router;
