// const User = require('../models/User');
// const bcrypt = require('bcryptjs');
// const jwt = require('jsonwebtoken');

// // 1. რეგისტრაცია (Register)
// exports.register = async (req, res) => {
//   try {
//     const { name, email, password } = req.body;

//     // შემოწმება არსებობს თუ არა იუზერი
//     let user = await User.findOne({ email: email.toLowerCase() });
//     if (user) {
//       return res.status(400).json({ message: 'მომხმარებელი ამ მეილით უკვე არსებობს' });
//     }

//     // პაროლის ჰეშირება
//     const salt = await bcrypt.genSalt(10);
//     const hashedPassword = await bcrypt.hash(password, salt);

//     // ახალი იუზერის შექმნა
//     user = new User({
//       name,
//       email: email.toLowerCase(),
//       normalizedEmail: email.toLowerCase(),
//       password: hashedPassword
//     });

//     await user.save();

//     // JWT ტოკენის გენერაცია
//     const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });

//     res.status(201).json({
//       token,
//       user: {
//         id: user._id,
//         name: user.name,
//         email: user.email,
//         tradingSessions: user.tradingSessions
//       }
//     });
//   } catch (error) {
//     res.status(500).json({ message: 'სერვერის შეცდომა', error: error.message });
//   }
// };

// // 2. სისტემაში შესვლა (Login)
// exports.login = async (req, res) => {
//   try {
//     const { email, password } = req.body;

//     const user = await User.findOne({ email: email.toLowerCase() });
//     if (!user) {
//       return res.status(400).json({ message: 'არასწორი მეილი ან პაროლი' });
//     }

//     // პაროლის შედარება
//     const isMatch = await bcrypt.compare(password, user.password);
//     if (!isMatch) {
//       return res.status(400).json({ message: 'არასწორი მეილი ან პაროლი' });
//     }

//     // ბოლო შესვლის დროის განახლება
//     user.lastLoginAt = new Date();
//     await user.save();

//     const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });

//     res.json({
//       token,
//       user: {
//         id: user._id,
//         name: user.name,
//         email: user.email,
//         tradingSessions: user.tradingSessions,
//         settings: user.settings
//       }
//     });
//   } catch (error) {
//     res.status(500).json({ message: 'სერვერის შეცდომა', error: error.message });
//   }
// };


// // ... ძველი კოდი (register და login) რჩება უცვლელი ...

// // 3. PROFILE UPDATE: მომხმარებლის სახელის განახლება
// exports.updateProfileName = async (req, res) => {
//   try {
//     const { name } = req.body;
//     if (!name) return res.status(400).json({ message: 'სახელის შეყვანა სავალდებულოა' });

//     const user = await User.findByIdAndUpdate(req.user, { $set: { name } }, { new: true }).select('-password');
//     res.json({ message: 'სახელი წარმატებით განახლდა', user });
//   } catch (error) {
//     res.status(500).json({ message: 'სერვერის შეცდომა პროფილის განახლებისას', error: error.message });
//   }
// };

// // 4. CHANGE PASSWORD: პაროლის უსაფრთხო შეცვლა [image_NIulD8.png]
// exports.changePassword = async (req, res) => {
//   try {
//     const { currentPassword, newPassword } = req.body;
//     if (!currentPassword || !newPassword) {
//       return res.status(400).json({ message: 'ყველა ველის შევსება სავალდებულოა' });
//     }

//     const user = await User.findById(req.user);
    
//     // შევამოწმოთ ძველი პაროლის სისწორე
//     const isMatch = await bcrypt.compare(currentPassword, user.password);
//     if (!isMatch) return res.status(400).json({ message: 'მიმდინარე პაროლი არასწორია' });

//     // ახალი პაროლის ჰეშირება
//     const salt = await bcrypt.genSalt(10);
//     user.password = await bcrypt.hash(newPassword, salt);
//     await user.save();

//     res.json({ message: 'პაროლი წარმატებით შეიცვალა' });
//   } catch (error) {
//     res.status(500).json({ message: 'სერვერის შეცდომა პაროლის შეცვლისას', error: error.message });
//   }
// };

// // 5. TRADING PREFERENCES: პარამეტრების შენახვა (Default Account, Currency, Timezone)
// exports.savePreferences = async (req, res) => {
//   try {
//     const { defaultAccount, currency, timezone, weekStart } = req.body;

//     const user = await User.findById(req.user);
//     if (!user) return res.status(404).json({ message: 'მომხმარებელი ვერ მოიძებნა' });

//     // ვანახლებთ settings.trading და settings ბლოკებს მოდელის მიხედვით
//     if (defaultAccount) user.settings.trading.defaultAccount = defaultAccount;
//     if (weekStart) user.settings.trading.weekStart = weekStart;
//     if (currency) user.settings.currency = currency;
//     if (timezone) user.settings.timezone = timezone;

//     await user.save();
//     res.json({ message: 'პარამეტრები წარმატებით შეინახა', settings: user.settings });
//   } catch (error) {
//     res.status(500).json({ message: 'სერვერის შეცდომა პარამეტრების შენახვისას', error: error.message });
//   }
// };

// // 6. DELETE ACCOUNT: მომხმარებლის და მისი ყველა მონაცემის კასკადური წაშლა [image_ip-CSP.png]
// exports.deleteUserAccount = async (req, res) => {
//   try {
//     // 1. ვშლით მომხმარებელს ბაზიდან
//     await User.findByIdAndDelete(req.user);

//     // 2. ავტომატურად ვასუფთავებთ ამ იუზერის ყველა თრეიდს, ექაუნთს და სტრატეგიას
//     const Trade = require('../models/Trade');
//     const Account = require('../models/Account');
//     const Strategy = require('../models/Strategy');

//     await Trade.deleteMany({ userId: req.user });
//     await Account.deleteMany({ userId: req.user });
//     await Strategy.deleteMany({ userId: req.user });

//     res.json({ message: 'თქვენი ანგარიში და ყველა სავაჭრო მონაცემი წარმატებით წაიშალა სისტემიდან' });
//   } catch (error) {
//     res.status(500).json({ message: 'სერვერის შეცდომა ანგარიშის წაშლისას', error: error.message });
//   }
// };

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const User = require('../models/User');
const { sendPasswordResetEmail } = require('../utils/sendEmail'); // ბილიკი მოარგე

const EMAIL_RE = /^\S+@\S+\.\S+$/;
const MIN_PASSWORD = 6;
const MAX_PASSWORD = 72; // bcrypt 72 ბაიტზე მეტს უგულებელყოფს
const NAME_MIN = 2;
const NAME_MAX = 40;

const RESET_TTL_MS = 60 * 60 * 1000; // ლინკი 1 საათი მოქმედებს
const RESET_COOLDOWN_MS = 60 * 1000; // ახალი ლინკი მაქსიმუმ წუთში ერთხელ

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

// ფრონტენდისთვის გასაგზავნი უსაფრთხო იუზერის ობიექტი (პაროლისა და reset ველების გარეშე)
const formatUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  avatar: user.avatar || '',
  tradingSessions: user.tradingSessions,
  settings: user.settings
});

const signToken = (userId) => jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '30d' });

// 1. რეგისტრაცია (Register)
exports.register = async (req, res) => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = req.body.password;

    if (!name) return res.status(400).json({ message: 'სახელი სავალდებულოა' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ message: 'მეილი არასწორია' });
    if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
      return res.status(400).json({ message: `პაროლი მინიმუმ ${MIN_PASSWORD} სიმბოლო უნდა იყოს` });
    }

    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ message: 'მომხმარებელი ამ მეილით უკვე არსებობს' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    user = new User({
      name,
      email,
      normalizedEmail: email,
      password: hashedPassword
    });
    await user.save();

    res.status(201).json({ token: signToken(user._id), user: formatUser(user) });
  } catch (error) {
    res.status(500).json({ message: 'სერვერის შეცდომა', error: error.message });
  }
};

// 2. სისტემაში შესვლა (Login)
exports.login = async (req, res) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = req.body.password;

    if (!email || typeof password !== 'string' || !password) {
      return res.status(400).json({ message: 'არასწორი მეილი ან პაროლი' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'არასწორი მეილი ან პაროლი' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'არასწორი მეილი ან პაროლი' });
    }

    await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });

    res.json({ token: signToken(user._id), user: formatUser(user) });
  } catch (error) {
    res.status(500).json({ message: 'სერვერის შეცდომა', error: error.message });
  }
};

// 3. FORGOT PASSWORD: ლინკის გაგზავნა მეილზე
// პასუხი ყოველთვის ერთნაირია, რომ ვინმემ ვერ გაიგოს რომელი მეილებია რეგისტრირებული
const FORGOT_GENERIC = { message: 'If an account with that email exists, a reset link has been sent.' };

exports.forgotPassword = async (req, res) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ message: 'გთხოვთ შეიყვანოთ სწორი მეილი' });
    }

    const user = await User.findOne({ email }).select('+resetPasswordExpires');
    if (!user) return res.json(FORGOT_GENERIC);

    // cooldown: თუ ლინკი ახლახან გაიგზავნა (ბოლო 60 წამში), ახალს აღარ ვაგზავნით
    if (
      user.resetPasswordExpires &&
      user.resetPasswordExpires.getTime() - RESET_TTL_MS > Date.now() - RESET_COOLDOWN_MS
    ) {
      return res.json(FORGOT_GENERIC);
    }

    // ბაზაში ინახება მხოლოდ ტოკენის ჰეში, ნამდვილი ტოკენი მხოლოდ მეილში მიდის
    const rawToken = crypto.randomBytes(32).toString('hex');
    await User.updateOne(
      { _id: user._id },
      { $set: { resetPasswordToken: hashToken(rawToken), resetPasswordExpires: new Date(Date.now() + RESET_TTL_MS) } }
    );

    const clientUrl = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');
    const resetUrl = `${clientUrl}/reset-password/${rawToken}`;

    try {
      await sendPasswordResetEmail({ to: user.email, name: user.name, resetUrl });
    } catch (mailError) {
      // მეილი ვერ გაიგზავნა (მაგ. Resend-ის სატესტო რეჟიმი სხვა მისამართზე არ გზავნის). ტოკენს ვასუფთავებთ
      console.error('Reset email send failed:', mailError.message);
      await User.updateOne(
        { _id: user._id },
        { $unset: { resetPasswordToken: 1, resetPasswordExpires: 1 } }
      );
    }

    return res.json(FORGOT_GENERIC);
  } catch (error) {
    res.status(500).json({ message: 'სერვერის შეცდომა', error: error.message });
  }
};

// 4. RESET PASSWORD: ახალი პაროლის დაყენება მეილიდან მიღებული ტოკენით
exports.resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    if (typeof token !== 'string' || !token) {
      return res.status(400).json({ message: 'ლინკი არასწორია ან ვადა გაუვიდა' });
    }
    if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
      return res.status(400).json({ message: `პაროლი მინიმუმ ${MIN_PASSWORD} სიმბოლო უნდა იყოს` });
    }
    if (password.length > MAX_PASSWORD) {
      return res.status(400).json({ message: `პაროლი მაქსიმუმ ${MAX_PASSWORD} სიმბოლო უნდა იყოს` });
    }

    const user = await User.findOne({
      resetPasswordToken: hashToken(token),
      resetPasswordExpires: { $gt: new Date() }
    });

    if (!user) {
      return res.status(400).json({ message: 'ლინკი არასწორია ან ვადა გაუვიდა. მოითხოვეთ ახალი.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // ტოკენი ერთჯერადია: პაროლის შეცვლისთანავე იშლება
    await User.updateOne(
      { _id: user._id },
      { $set: { password: hashedPassword }, $unset: { resetPasswordToken: 1, resetPasswordExpires: 1 } }
    );

    res.json({ message: 'პაროლი წარმატებით შეიცვალა. ახლა შეგიძლიათ შეხვიდეთ.' });
  } catch (error) {
    res.status(500).json({ message: 'სერვერის შეცდომა', error: error.message });
  }
};

// 5. PROFILE UPDATE: სახელის განახლება
exports.updateProfileName = async (req, res) => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim().replace(/\s+/g, ' ') : '';

    if (name.length < NAME_MIN) {
      return res.status(400).json({ message: `სახელი მინიმუმ ${NAME_MIN} სიმბოლო უნდა იყოს` });
    }
    if (name.length > NAME_MAX) {
      return res.status(400).json({ message: `სახელი მაქსიმუმ ${NAME_MAX} სიმბოლო უნდა იყოს` });
    }

    const user = await User.findByIdAndUpdate(req.user, { $set: { name } }, { new: true });
    if (!user) return res.status(404).json({ message: 'მომხმარებელი ვერ მოიძებნა' });

    res.json({ message: 'სახელი წარმატებით განახლდა', user: formatUser(user) });
  } catch (error) {
    res.status(500).json({ message: 'სერვერის შეცდომა პროფილის განახლებისას', error: error.message });
  }
};

// 6. CHANGE PASSWORD: პაროლის შეცვლა (ძველი პაროლის დადასტურებით)
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (typeof currentPassword !== 'string' || !currentPassword || typeof newPassword !== 'string' || !newPassword) {
      return res.status(400).json({ message: 'ყველა ველის შევსება სავალდებულოა' });
    }
    if (newPassword.length < MIN_PASSWORD) {
      return res.status(400).json({ message: `ახალი პაროლი მინიმუმ ${MIN_PASSWORD} სიმბოლო უნდა იყოს` });
    }
    if (newPassword.length > MAX_PASSWORD) {
      return res.status(400).json({ message: `ახალი პაროლი მაქსიმუმ ${MAX_PASSWORD} სიმბოლო უნდა იყოს` });
    }
    if (newPassword === currentPassword) {
      return res.status(400).json({ message: 'ახალი პაროლი ძველისგან განსხვავებული უნდა იყოს' });
    }

    const user = await User.findById(req.user);
    if (!user) return res.status(404).json({ message: 'მომხმარებელი ვერ მოიძებნა' });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) return res.status(400).json({ message: 'მიმდინარე პაროლი არასწორია' });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    await User.updateOne({ _id: user._id }, { $set: { password: hashedPassword } });

    res.json({ message: 'პაროლი წარმატებით შეიცვალა' });
  } catch (error) {
    res.status(500).json({ message: 'სერვერის შეცდომა პაროლის შეცვლისას', error: error.message });
  }
};

// 7. TRADING PREFERENCES (უცვლელია)
exports.savePreferences = async (req, res) => {
  try {
    const { defaultAccount, currency, timezone, weekStart } = req.body;

    const user = await User.findById(req.user);
    if (!user) return res.status(404).json({ message: 'მომხმარებელი ვერ მოიძებნა' });

    if (defaultAccount) user.settings.trading.defaultAccount = defaultAccount;
    if (weekStart) user.settings.trading.weekStart = weekStart;
    if (currency) user.settings.currency = currency;
    if (timezone) user.settings.timezone = timezone;

    await user.save();
    res.json({ message: 'პარამეტრები წარმატებით შეინახა', settings: user.settings });
  } catch (error) {
    res.status(500).json({ message: 'სერვერის შეცდომა პარამეტრების შენახვისას', error: error.message });
  }
};

// 8. EXPORT MY DATA: მომხმარებლის ყველა მონაცემის JSON ფაილად ჩამოტვირთვა
exports.exportMyData = async (req, res) => {
  try {
    const Trade = require('../models/Trade');
    const Account = require('../models/Account');
    const Strategy = require('../models/Strategy');
    const Session = require('../models/Session');

    const userId = req.user;

    const [user, accounts, strategies, sessions, trades] = await Promise.all([
      User.findById(userId).select('-password -resetPasswordToken -resetPasswordExpires').lean(),
      Account.find({ userId }).lean(),
      Strategy.find({ userId }).lean(),
      Session.find({ userId }).lean(),
      Trade.find({ userId }).sort({ entryDate: 1 }).lean()
    ]);

    if (!user) return res.status(404).json({ message: 'მომხმარებელი ვერ მოიძებნა' });

    const payload = {
      exportedAt: new Date().toISOString(),
      user,
      accounts,
      strategies,
      sessions,
      trades
    };

    const day = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="yonko-export-${day}.json"`);
    res.send(JSON.stringify(payload, null, 2));
  } catch (error) {
    res.status(500).json({ message: 'სერვერის შეცდომა მონაცემების ექსპორტისას', error: error.message });
  }
};

// 9. DELETE ACCOUNT: მომხმარებლის და მისი ყველა მონაცემის სამუდამო წაშლა (პაროლის დადასტურებით)
exports.deleteUserAccount = async (req, res) => {
  try {
    const password = req.body && req.body.password;
    if (typeof password !== 'string' || !password) {
      return res.status(400).json({ message: 'წასაშლელად პაროლის შეყვანა სავალდებულოა' });
    }

    const user = await User.findById(req.user);
    if (!user) return res.status(404).json({ message: 'მომხმარებელი ვერ მოიძებნა' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'პაროლი არასწორია' });

    const Trade = require('../models/Trade');
    const Account = require('../models/Account');
    const Strategy = require('../models/Strategy');
    const Session = require('../models/Session');

    // ჯერ მონაცემებს ვშლით, მომხმარებელს ბოლოს. თუ შუაში რამე ჩავარდა, იუზერი რჩება და თავიდან სცდის
    await Promise.all([
      Trade.deleteMany({ userId: user._id }),
      Account.deleteMany({ userId: user._id }),
      Strategy.deleteMany({ userId: user._id }),
      Session.deleteMany({ userId: user._id })
    ]);
    await User.deleteOne({ _id: user._id });

    res.json({ message: 'თქვენი ანგარიში და ყველა სავაჭრო მონაცემი წარმატებით წაიშალა' });
  } catch (error) {
    res.status(500).json({ message: 'სერვერის შეცდომა ანგარიშის წაშლისას', error: error.message });
  }
};
