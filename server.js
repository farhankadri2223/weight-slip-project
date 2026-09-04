const express = require("express");
const multer = require("multer");
const session = require("express-session");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

const app = express();
const PORT = process.env.PORT || 3000;

// ======================================================
// FOLDERS
// ======================================================

const uploadDir = path.join(__dirname, "uploads");
const outputDir = path.join(__dirname, "output");

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

// ======================================================
// USERS - 3 USERS
// ======================================================

const users = {
    user1: "user123",
    user2: "user123",
    user3: "user123"
};

// ======================================================
// MIDDLEWARE
// ======================================================

app.use(express.urlencoded({ extended: true }));

app.use(
    session({
        secret: "weight-slip-secret-2026",
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: 1000 * 60 * 60 * 8
        }
    })
);

app.use(express.static(path.join(__dirname, "public")));

// ======================================================
// MULTER - EXCEL UPLOAD
// ======================================================

const storage = multer.diskStorage({

    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },

    filename: function (req, file, cb) {

        const extension =
            path.extname(file.originalname).toLowerCase();

        const filename =
            "excel_" +
            Date.now() +
            extension;

        cb(null, filename);
    }
});

const upload = multer({

    storage: storage,

    fileFilter: function (req, file, cb) {

        const extension =
            path.extname(file.originalname).toLowerCase();

        if (
            extension === ".xlsx" ||
            extension === ".xls"
        ) {
            cb(null, true);
        } else {
            cb(
                new Error(
                    "Only Excel files (.xlsx / .xls) are allowed."
                )
            );
        }
    },

    limits: {
        fileSize: 20 * 1024 * 1024
    }
});

// ======================================================
// LOGIN PAGE
// ======================================================

app.get("/", (req, res) => {

    if (req.session.user) {
        return res.redirect("/dashboard.html");
    }

    res.sendFile(
        path.join(__dirname, "public", "login.html")
    );
});

// ======================================================
// LOGIN
// ======================================================

app.post("/login", (req, res) => {

    const username = req.body.username;
    const password = req.body.password;

    if (
        users[username] &&
        users[username] === password
    ) {

        req.session.user = username;

        return res.redirect("/dashboard.html");
    }

    res.status(401).send(`
        <html>
        <body style="font-family:Arial;text-align:center;padding:80px">

            <h2>❌ Invalid username or password</h2>

            <br>

            <a href="/">
                Back to Login
            </a>

        </body>
        </html>
    `);
});

// ======================================================
// AUTHENTICATION CHECK
// ======================================================

function requireLogin(req, res, next) {

    if (!req.session.user) {
        return res.redirect("/");
    }

    next();
}

// ======================================================
// DASHBOARD PROTECTION
// ======================================================

app.get("/dashboard.html", requireLogin, (req, res) => {

    res.sendFile(
        path.join(
            __dirname,
            "public",
            "dashboard.html"
        )
    );
});

// ======================================================
// UPLOAD + GENERATE PDF
// ======================================================

app.post(
    "/upload",
    requireLogin,
    upload.single("excel"),
    async (req, res) => {

        try {

            if (!req.file) {

                return res.status(400).send(`
                    <h2>No Excel file uploaded.</h2>
                    <a href="/dashboard.html">
                        Go Back
                    </a>
                `);
            }

            const excelPath = req.file.path;

            console.log("");
            console.log("====================================");
            console.log("EXCEL RECEIVED");
            console.log("User:", req.session.user);
            console.log("File:", req.file.originalname);
            console.log("====================================");

            // ------------------------------------------
            // UNIQUE PDF NAME
            // ------------------------------------------

            const pdfName =
                "WEIGHT-SLIPS-" +
                Date.now() +
                ".pdf";

            const pdfPath =
                path.join(outputDir, pdfName);

            console.log("");
            console.log("Generating PDF...");
            console.log("Output:", pdfPath);

            // ------------------------------------------
            // RUN GENERATE.JS
            // ------------------------------------------

            const generator = spawn(
                process.execPath,
                [
                    path.join(__dirname, "generate.js"),
                    excelPath,
                    pdfPath
                ],
                {
                    cwd: __dirname
                }
            );

            let errorOutput = "";

            generator.stdout.on(
                "data",
                (data) => {

                    console.log(
                        data.toString()
                    );
                }
            );

            generator.stderr.on(
                "data",
                (data) => {

                    errorOutput +=
                        data.toString();

                    console.error(
                        data.toString()
                    );
                }
            );

            // ------------------------------------------
            // GENERATION FINISHED
            // ------------------------------------------

            generator.on(
                "close",
                async (code) => {

                    try {

                        if (code !== 0) {

                            console.log(
                                "PDF generation failed."
                            );

                            return res.status(500).send(`
                                <html>
                                <body style="font-family:Arial;text-align:center;padding:60px">

                                    <h2>❌ PDF Generation Failed</h2>

                                    <p>
                                        Please check the Excel format.
                                    </p>

                                    <br>

                                    <a href="/dashboard.html">
                                        Try Again
                                    </a>

                                </body>
                                </html>
                            `);
                        }

                        // --------------------------------
                        // CHECK PDF EXISTS
                        // --------------------------------

                        if (!fs.existsSync(pdfPath)) {

                            return res.status(500).send(`
                                <html>
                                <body style="font-family:Arial;text-align:center;padding:60px">

                                    <h2>❌ PDF was not created.</h2>

                                    <a href="/dashboard.html">
                                        Try Again
                                    </a>

                                </body>
                                </html>
                            `);
                        }

                        console.log("");
                        console.log(
                            "===================================="
                        );
                        console.log(
                            "PDF GENERATED SUCCESSFULLY"
                        );
                        console.log(
                            "===================================="
                        );

                        // --------------------------------
                        // DELETE UPLOADED EXCEL
                        // --------------------------------

                        setTimeout(() => {

                            try {

                                if (
                                    fs.existsSync(
                                        excelPath
                                    )
                                ) {

                                    fs.unlinkSync(
                                        excelPath
                                    );
                                }

                            } catch (error) {

                                console.log(
                                    "Could not delete uploaded Excel."
                                );
                            }

                        }, 5000);

                        // --------------------------------
                        // DOWNLOAD PDF
                        // --------------------------------

                        res.download(
                            pdfPath,
                            pdfName,
                            (downloadError) => {

                                if (downloadError) {

                                    console.error(
                                        "Download error:",
                                        downloadError
                                    );
                                }
                            }
                        );

                    } catch (error) {

                        console.error(
                            "Generation handling error:",
                            error
                        );

                        if (!res.headersSent) {

                            res.status(500).send(
                                "Something went wrong."
                            );
                        }
                    }
                }
            );

        } catch (error) {

            console.error(
                "Upload error:",
                error
            );

            res.status(500).send(`
                <h2>❌ Something went wrong</h2>

                <a href="/dashboard.html">
                    Go Back
                </a>
            `);
        }
    }
);

// ======================================================
// LOGOUT
// ======================================================

app.get("/logout", (req, res) => {

    req.session.destroy(() => {

        res.redirect("/");
    });
});

// ======================================================
// START SERVER
// ======================================================
app.listen(PORT, "0.0.0.0", () => {

    console.log("");
    console.log("====================================");
    console.log("WEIGHT SLIP WEBSITE STARTED");
    console.log("====================================");
    console.log("");
    console.log(
        `Open: http://localhost:${PORT}`
    );
    console.log("");
});