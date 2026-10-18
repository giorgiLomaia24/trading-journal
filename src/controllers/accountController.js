// const mongoose = require('mongoose');
// const Account = require('../models/Account');

// const MAX_NAME_LENGTH = 40;
// const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// // ველები, რომლის შეცვლაც კლიენტს შეუძლია (userId და სხვა სისტემური ველები გარედან ვერ შეიცვლება)
// const UPDATABLE_FIELDS = [
//   'accountName', 'accountType', 'initialBalance', 'currency',
//   'broker', 'accountNumber', 'maxDrawdown', 'notes'
// ];

// // 1. CREATE: ახალი სავაჭრო ანგარიშის შექმნა
// exports.createAccount = async (req, res) => {
//   try {
//     const { accountName, accountType, initialBalance, currency, broker, accountNumber, maxDrawdown, notes } = req.body;

//     const newAccount = new Account({
//       userId: req.user, // მოვა ტოკენიდან (authMiddleware)
//       accountName,
//       accountType,
//       initialBalance,
//       currency,
//       broker,
//       accountNumber,
//       maxDrawdown,
//       notes
//     });

//     const account = await newAccount.save();
//     res.status(201).json(account);
//   } catch (error) {
//     res.status(500).json({ message: 'სერვერის შეცდომა ანგარიშის შექმნისას', error: error.message });
//   }
// };

// // 2. READ ALL: მომხმარებლის ყველა ანგარიშის წამოღება
// exports.getAccounts = async (req, res) => {
//   try {
//     const accounts = await Account.find({ userId: req.user });
//     res.json(accounts);
//   } catch (error) {
//     res.status(500).json({ message: 'სერვერის შეცდომა ანგარიშების წამოღებისას', error: error.message });
//   }
// };

// // 3. READ SINGLE: კონკრეტული ანგარიშის წამოღება ID-ით
// exports.getAccountById = async (req, res) => {
//   try {
//     if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
//       return res.status(400).json({ message: 'არასწორი ანგარიშის ID' });
//     }

//     const account = await Account.findOne({ _id: req.params.id, userId: req.user });

//     if (!account) {
//       return res.status(404).json({ message: 'სავაჭრო ანგარიში ვერ მოიძებნა ან არ გაქვთ წვდომის უფლება' });
//     }

//     res.json(account);
//   } catch (error) {
//     res.status(500).json({ message: 'სერვერის შეცდომა ანგარიშის წამოღებისას', error: error.message });
//   }
// };

// // 4. UPDATE: ანგარიშის მონაცემების განახლება (სახელი, ბალანსი, ბროკერი, ნოუთები და ა.შ.)
// exports.updateAccount = async (req, res) => {
//   try {
//     if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
//       return res.status(400).json({ message: 'არასწორი ანგარიშის ID' });
//     }

//     const account = await Account.findOne({ _id: req.params.id, userId: req.user });

//     if (!account) {
//       return res.status(404).json({ message: 'სავაჭრო ანგარიში ვერ მოიძებნა ან არ გაქვთ ჩასწორების უფლება' });
//     }

//     // სახელის ვალიდაცია (თუ იცვლება)
//     if (req.body.accountName !== undefined) {
//       const name = typeof req.body.accountName === 'string' ? req.body.accountName.trim() : '';

//       if (!name) {
//         return res.status(400).json({ message: 'ანგარიშის სახელი სავალდებულოა' });
//       }
//       if (name.length > MAX_NAME_LENGTH) {
//         return res.status(400).json({ message: `სახელი მაქსიმუმ ${MAX_NAME_LENGTH} სიმბოლო უნდა იყოს` });
//       }

//       // იგივე სახელის მქონე სხვა ანგარიში არ უნდა არსებობდეს
//       if (name !== account.accountName) {
//         const duplicate = await Account.findOne({
//           userId: req.user,
//           _id: { $ne: account._id },
//           accountName: new RegExp(`^${escapeRegex(name)}$`, 'i')
//         });
//         if (duplicate) {
//           return res.status(409).json({ message: 'ამ სახელის ანგარიში უკვე არსებობს' });
//         }
//       }

//       req.body.accountName = name;
//     }

//     UPDATABLE_FIELDS.forEach((field) => {
//       if (req.body[field] !== undefined) account[field] = req.body[field];
//     });

//     const saved = await account.save(); // save() მოდელის ვალიდაციასაც ატარებს
//     res.json(saved);
//   } catch (error) {
//     res.status(500).json({ message: 'სერვერის შეცდომა ანგარიშის განახლებისას', error: error.message });
//   }
// };

// // 5. DELETE: სავაჭრო ანგარიშის და მასთან დაკავშირებული ყველა თრეიდის წაშლა
// exports.deleteAccount = async (req, res) => {
//   try {
//     const accountId = req.params.id;

//     if (!mongoose.Types.ObjectId.isValid(accountId)) {
//       return res.status(400).json({ message: 'არასწორი ანგარიშის ID' });
//     }

//     // ჯერ ვამოწმებთ, რომ ანგარიში არსებობს და ამ მომხმარებელს ეკუთვნის
//     const account = await Account.findOne({ _id: accountId, userId: req.user });

//     if (!account) {
//       return res.status(404).json({ message: 'სავაჭრო ანგარიში ვერ მოიძებნა ან არ გაქვთ წაშლის უფლება' });
//     }

//     // ჯერ ვშლით თრეიდებს, მერე თავად ანგარიშს.
//     // თუ თრეიდების წაშლა ჩავარდა, ანგარიში რჩება და მომხმარებელს შეუძლია თავიდან სცადოს
//     const Trade = require('../models/Trade'); // დინამიური იმპორტი ციკლური დამოკიდებულების თავიდან ასაცილებლად
//     const { deletedCount } = await Trade.deleteMany({ account: account._id, userId: req.user });

//     await account.deleteOne();

//     res.json({
//       message: 'სავაჭრო ანგარიში და მასთან დაკავშირებული ყველა თრეიდი წარმატებით წაიშალა',
//       deletedTrades: deletedCount
//     });
//   } catch (error) {
//     res.status(500).json({ message: 'სერვერის შეცდომა ანგარიშის წაშლისას', error: error.message });
//   }
// };

const mongoose = require('mongoose');
const Account = require('../models/Account');
const { withAnchor, withAnchors } = require('../utils/accountAnchor'); // ბილიკი მოარგე

const MAX_NAME_LENGTH = 40;
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ველები, რომლის შეცვლაც კლიენტს შეუძლია (userId და სხვა სისტემური ველები გარედან ვერ შეიცვლება)
const UPDATABLE_FIELDS = [
  'accountName', 'accountType', 'initialBalance', 'currency',
  'broker', 'accountNumber', 'maxDrawdown', 'notes'
];

// 1. CREATE: ახალი სავაჭრო ანგარიშის შექმნა
exports.createAccount = async (req, res) => {
  try {
    const { accountName, accountType, initialBalance, currency, broker, accountNumber, maxDrawdown, notes, startingDate } = req.body;

    const newAccount = new Account({
      userId: req.user, // მოვა ტოკენიდან (authMiddleware)
      accountName,
      accountType,
      initialBalance,
      currency,
      broker,
      accountNumber,
      maxDrawdown,
      notes
    });

    // საწყისი თარიღი: ბექტესტისთვის სავალდებულოა (აქედან იწყება "ვირტუალური დღევანდელი დღე")
    if (startingDate) {
      const d = new Date(startingDate);
      if (Number.isNaN(d.getTime())) {
        return res.status(400).json({ message: 'საწყისი თარიღი არასწორია' });
      }
      if (d.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
        return res.status(400).json({ message: 'საწყისი თარიღი მომავალში ვერ იქნება' });
      }
      newAccount.startingDate = d;
    } else if (accountType === 'Backtest') {
      return res.status(400).json({ message: 'ბექტესტ ანგარიშისთვის საწყისი თარიღი სავალდებულოა' });
    }

    const account = await newAccount.save();
    res.status(201).json(await withAnchor(req.user, account));
  } catch (error) {
    res.status(500).json({ message: 'სერვერის შეცდომა ანგარიშის შექმნისას', error: error.message });
  }
};

// 2. READ ALL: მომხმარებლის ყველა ანგარიშის წამოღება (ბექტესტზე anchorDate-ით)
exports.getAccounts = async (req, res) => {
  try {
    const accounts = await Account.find({ userId: req.user });
    res.json(await withAnchors(req.user, accounts));
  } catch (error) {
    res.status(500).json({ message: 'სერვერის შეცდომა ანგარიშების წამოღებისას', error: error.message });
  }
};

// 3. READ SINGLE: კონკრეტული ანგარიშის წამოღება ID-ით
exports.getAccountById = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'არასწორი ანგარიშის ID' });
    }

    const account = await Account.findOne({ _id: req.params.id, userId: req.user });

    if (!account) {
      return res.status(404).json({ message: 'სავაჭრო ანგარიში ვერ მოიძებნა ან არ გაქვთ წვდომის უფლება' });
    }

    res.json(await withAnchor(req.user, account));
  } catch (error) {
    res.status(500).json({ message: 'სერვერის შეცდომა ანგარიშის წამოღებისას', error: error.message });
  }
};

// 4. UPDATE: ანგარიშის მონაცემების განახლება (სახელი, ბალანსი, ბროკერი, ნოუთები და ა.შ.)
exports.updateAccount = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'არასწორი ანგარიშის ID' });
    }

    const account = await Account.findOne({ _id: req.params.id, userId: req.user });

    if (!account) {
      return res.status(404).json({ message: 'სავაჭრო ანგარიში ვერ მოიძებნა ან არ გაქვთ ჩასწორების უფლება' });
    }

    // სახელის ვალიდაცია (თუ იცვლება)
    if (req.body.accountName !== undefined) {
      const name = typeof req.body.accountName === 'string' ? req.body.accountName.trim() : '';

      if (!name) {
        return res.status(400).json({ message: 'ანგარიშის სახელი სავალდებულოა' });
      }
      if (name.length > MAX_NAME_LENGTH) {
        return res.status(400).json({ message: `სახელი მაქსიმუმ ${MAX_NAME_LENGTH} სიმბოლო უნდა იყოს` });
      }

      // იგივე სახელის მქონე სხვა ანგარიში არ უნდა არსებობდეს
      if (name !== account.accountName) {
        const duplicate = await Account.findOne({
          userId: req.user,
          _id: { $ne: account._id },
          accountName: new RegExp(`^${escapeRegex(name)}$`, 'i')
        });
        if (duplicate) {
          return res.status(409).json({ message: 'ამ სახელის ანგარიში უკვე არსებობს' });
        }
      }

      req.body.accountName = name;
    }

    UPDATABLE_FIELDS.forEach((field) => {
      if (req.body[field] !== undefined) account[field] = req.body[field];
    });

    const saved = await account.save(); // save() მოდელის ვალიდაციასაც ატარებს
    // anchorDate ისევ უნდა დაბრუნდეს, თორემ გადარქმევის შემდეგ ფრონტენდი მას დაკარგავს
    res.json(await withAnchor(req.user, saved));
  } catch (error) {
    res.status(500).json({ message: 'სერვერის შეცდომა ანგარიშის განახლებისას', error: error.message });
  }
};

// 5. DELETE: სავაჭრო ანგარიშის და მასთან დაკავშირებული ყველა თრეიდის წაშლა
exports.deleteAccount = async (req, res) => {
  try {
    const accountId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(accountId)) {
      return res.status(400).json({ message: 'არასწორი ანგარიშის ID' });
    }

    // ჯერ ვამოწმებთ, რომ ანგარიში არსებობს და ამ მომხმარებელს ეკუთვნის
    const account = await Account.findOne({ _id: accountId, userId: req.user });

    if (!account) {
      return res.status(404).json({ message: 'სავაჭრო ანგარიში ვერ მოიძებნა ან არ გაქვთ წაშლის უფლება' });
    }

    // ჯერ ვშლით თრეიდებს, მერე თავად ანგარიშს.
    // თუ თრეიდების წაშლა ჩავარდა, ანგარიში რჩება და მომხმარებელს შეუძლია თავიდან სცადოს
    const Trade = require('../models/Trade'); // დინამიური იმპორტი ციკლური დამოკიდებულების თავიდან ასაცილებლად
    const { deletedCount } = await Trade.deleteMany({ account: account._id, userId: req.user });

    await account.deleteOne();

    res.json({
      message: 'სავაჭრო ანგარიში და მასთან დაკავშირებული ყველა თრეიდი წარმატებით წაიშალა',
      deletedTrades: deletedCount
    });
  } catch (error) {
    res.status(500).json({ message: 'სერვერის შეცდომა ანგარიშის წაშლისას', error: error.message });
  }
};