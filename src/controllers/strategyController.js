const Strategy = require('../models/Strategy');
const Trade = require('../models/Trade');

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// 1. CREATE: ახალი სტრატეგიის შექმნა დინამიური წესებით
exports.createStrategy = async (req, res) => {
  try {
    const { strategyName, description, color, rules } = req.body;

    const newStrategy = new Strategy({
      userId: req.user,
      strategyName,
      description,
      color,
      rules: rules || []
    });

    const strategy = await newStrategy.save();
    res.status(201).json(strategy);
  } catch (error) {
    res.status(500).json({ message: 'სერვერის შეცდომა სტრატეგიის შექმნისას', error: error.message });
  }
};

// 2. READ ALL: მომხმარებლის ყველა სტრატეგიის წამოღება
exports.getStrategies = async (req, res) => {
  try {
    const strategies = await Strategy.find({ userId: req.user });
    res.json(strategies);
  } catch (error) {
    res.status(500).json({ message: 'სერვერის შეცდომა სტრატეგიების წამოღებისას', error: error.message });
  }
};

// 3. READ SINGLE: კონკრეტული სტრატეგიის წამოღება ID-ით
exports.getStrategyById = async (req, res) => {
  try {
    const strategy = await Strategy.findOne({ _id: req.params.id, userId: req.user });
    
    if (!strategy) {
      return res.status(404).json({ message: 'სტრატეგია ვერ მოიძებნა ან არ გაქვთ წვდომის უფლება' });
    }
    
    res.json(strategy);
  } catch (error) {
    res.status(500).json({ message: 'სერვერის შეცდომა სტრატეგიის წამოღებისას', error: error.message });
  }
};

// 4. UPDATE: სტრატეგიის ან მისი წესების განახლება (ჩასწორება/დამატება)
// exports.updateStrategy = async (req, res) => {
//   try {
//     const strategy = await Strategy.findOneAndUpdate(
//       { _id: req.params.id, userId: req.user },
//       { $set: req.body },
//       { new: true, runValidators: true } // დააბრუნებს განახლებულ ვერსიას და გადაამოწმებს ვალიდაციას
//     );

//     if (!strategy) {
//       return res.status(404).json({ message: 'სტრატეგია ვერ მოიძებნა ან არ გაქვთ ჩასწორების უფლება' });
//     }

//     res.json(strategy);
//   } catch (error) {
//     res.status(500).json({ message: 'სერვერის შეცდომა სტრატეგიის განახლებისას', error: error.message });
//   }
// };

exports.updateStrategy = async (req, res) => {
  try {
    const existing = await Strategy.findOne({ _id: req.params.id, userId: req.user });
    if (!existing) {
      return res.status(404).json({ message: 'სტრატეგია ვერ მოიძებნა ან არ გაქვთ ჩასწორების უფლება' });
    }

    const oldName = existing.strategyName;
    const newName =
      typeof req.body.strategyName === 'string' ? req.body.strategyName.trim() : oldName;

    if (!newName) {
      return res.status(400).json({ message: 'სტრატეგიის სახელი სავალდებულოა' });
    }

    // ახალი სახელი სხვა სტრატეგიას არ უნდა ემთხვეოდეს, თორემ ტრეიდები აირევა
    if (newName !== oldName) {
      const duplicate = await Strategy.findOne({
        userId: req.user,
        _id: { $ne: existing._id },
        strategyName: new RegExp(`^${escapeRegex(newName)}$`, 'i')
      });
      if (duplicate) {
        return res.status(409).json({ message: 'ამ სახელის სტრატეგია უკვე არსებობს' });
      }
    }

    // მხოლოდ დაშვებული ველები (userId და სხვა სისტემური ველები გარედან ვერ შეიცვლება)
    const { description, color, rules } = req.body;
    existing.strategyName = newName;
    if (description !== undefined) existing.description = description;
    if (color !== undefined) existing.color = color;
    if (Array.isArray(rules)) existing.rules = rules;

    const saved = await existing.save();

    // ტრეიდებში სახელის გავრცელება
    if (newName !== oldName) {
      await Trade.updateMany(
        { userId: req.user, strategy: oldName },
        { $set: { strategy: newName } }
      );
    }

    res.json(saved);
  } catch (error) {
    res.status(500).json({ message: 'სერვერის შეცდომა სტრატეგიის განახლებისას', error: error.message });
  }
};


// 6. მხოლოდ კონკრეტული სტრატეგიის წესების მასივის წამოღება ID-ით
exports.getStrategyRules = async (req, res) => {
  try {
    // .select('rules') ეუბნება ბაზას, რომ სხვა ველები (სახელი, ფერი და ა.შ.) არ წამოიღოს
    const strategy = await Strategy.findOne({ _id: req.params.id, userId: req.user }).select('rules');
    
    if (!strategy) {
      return res.status(404).json({ message: 'სტრატეგია ვერ მოიძებნა' });
    }
    
    // დავაბრუნოთ მხოლოდ წესების მასივი
    res.json(strategy.rules);
  } catch (error) {
    res.status(500).json({ message: 'სერვერის შეცდომა წესების წამოღებისას', error: error.message });
  }
};
// 5. DELETE: სტრატეგიის და მასთან დაკავშირებული ყველა თრეიდის წაშლა
exports.deleteStrategy = async (req, res) => {
  try {
    const strategyId = req.params.id;

    // 1. ჯერ ვპოულობთ სტრატეგიას, რომ მისი სახელი გავიგოთ თრეიდების წასაშლელად
    const strategy = await Strategy.findOne({ _id: strategyId, userId: req.user });

    if (!strategy) {
      return res.status(404).json({ message: 'სტრატეგია ვერ მოიძებნა ან არ გაქვთ წაშლის უფლება' });
    }

    const strategyName = strategy.strategyName;

    // 2. ვშლით თავად სტრატეგიას
    await Strategy.findByIdAndDelete(strategyId);

    // 3. ავტომატურად ვშლით ყველა თრეიდს, რომელიც ამ სტრატეგიის სახელით იყო დაჟურნალებული
    const Trade = require('../models/Trade');
    await Trade.deleteMany({ strategy: strategyName, userId: req.user });

    res.json({ message: 'სტრატეგია და მასთან დაკავშირებული ყველა თრეიდი წარმატებით წაიშალა' });
  } catch (error) {
    res.status(500).json({ message: 'სერვერის შეცდომა სტრატეგიის წაშლისას', error: error.message });
  }
};
