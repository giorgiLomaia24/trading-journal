const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

// Cloudinary-ს პარამეტრების დაკავშირება .env ფაილიდან
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// საცავის (Storage) გამართვა თრეიდებისა და პროფილის ფოტოებისთვის
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'SydView_Journal', // ფოლდერის სახელი Cloudinary-ზე
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 1200, height: 1200, crop: 'limit' }] // ფოტოების ზომის ოპტიმიზაცია
  }
});

const upload = multer({ storage: storage });

module.exports = upload;
