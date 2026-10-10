import multer from "multer";

const storage = multer.diskStorage({});

// Admin hero-poster uploads: images only, at most 8 MB
const upload = multer({
    storage,
    limits: { fileSize: 8 * 1024 * 1024, files: 1 },
    fileFilter: (req, file, cb) => (/^image\/(jpeg|png|webp|avif|gif)$/.test(file.mimetype) ? cb(null, true) : cb(new Error('Please upload a JPG, PNG, WebP, AVIF or GIF image'))),
});

export default upload;
