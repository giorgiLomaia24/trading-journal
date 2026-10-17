const mongoose = require('mongoose');

const connectDB = require('mongoose').connect; // მოდულის შემოტანა

const connectDatabase = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`🍃 MongoDB დაკავშირებულია: ${conn.connection.host}`);
  } catch (error) {
    console.error(`❌ ბაზასთან კავშირის შეცდომა: ${error.message}`);
    process.exit(1); // პროცესის გათიშვა შეცდომის შემთხვევაში
  }
};

module.exports = connectDatabase;
