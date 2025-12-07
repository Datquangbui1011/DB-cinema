import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

console.log("Email Config Loaded");
console.log("User:", process.env.EMAIL_USER);
console.log("Pass set:", !!process.env.EMAIL_PASS);

transporter.verify(function (error, success) {
    if (error) {
        console.log("Transporter verification failed:", error);
    } else {
        console.log("Server is ready to take our messages");
    }
});

export default transporter;
