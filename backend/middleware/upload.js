const multer = require("multer");

// Invoice photos are received as multipart/form-data, held in memory just
// long enough to stream to Cloudinary (see purchaseController.attachInvoice),
// then discarded — nothing ever touches this server's disk. 8MB comfortably
// covers a phone camera photo; the frontend also compresses before upload so
// in practice most uploads land well under 1MB.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files can be uploaded"));
    }
    cb(null, true);
  },
});

// multer reports problems (file too large, wrong type) by calling next(err)
// with a plain Error/MulterError that has no `status` — left alone that
// falls through to the global error handler as a 500 and fires an error
// alert for what's really routine bad input. This wraps it as a 400 instead,
// the same way controllers report validation failures everywhere else.
function imageField(fieldName) {
  const single = upload.single(fieldName);
  return (req, res, next) => {
    single(req, res, (err) => {
      if (err) return res.status(400).json({ message: err.message || "Upload failed" });
      next();
    });
  };
}

module.exports = { imageField };
