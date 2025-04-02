const qr = require('qr-image');
const fs = require('fs');
const express = require('express');
const { MongoClient } = require('mongodb');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

// Create directories for storing qr code
const QR_DIR = './qr_codes';
const TXT_DIR = './text_files';
fs.mkdirSync(QR_DIR, { recursive: true });
fs.mkdirSync(TXT_DIR, { recursive: true });

const mongoURI = ''; 

let client;

async function connectToMongoDB() {
    try {
        client = new MongoClient(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true });
        await client.connect();
        console.log('Connected to MongoDB');
    } catch (error) {
        console.error('Error connecting to MongoDB:', error);
        process.exit(1); 
    }
}


app.post('/api/recruiter/signup', async (req, res) => {
    const { LinkedIn, Company, FirstName, LastName, Email, Password } = req.body;

    if (!LinkedIn || !Company || !FirstName || !LastName || !Email || !Password ) {
        return res.status(400).json({ error: 'All fields (LinkedIn, Company, FirstName, LastName, Email, and Password ) are required.' });
    }

    try {
        const db = client.db('RecruitmentSystem');
        const recruitersCollection = db.collection('Recruiters');

        //check email exists in all database
        const studentsCollection = db.collection('Students');
        const existingRecruiter = await recruitersCollection.findOne({ Email });
        const existingStudent = await studentsCollection.findOne({ Email });

        if (existingRecruiter || existingStudent) {
            return res.status(400).json({ error: 'Email Already Taken.' });
        }

        const newRecruiter = {
            LinkedIn,
            Company,
            Events: [], 
            FirstName,
            LastName,
            Email,
            Password
        };

        const result = await recruitersCollection.insertOne(newRecruiter);

        res.status(201).json({
            ID: result.insertedId,
            LinkedIn,
            Company,
            Events: [],
            FirstName,
            LastName,
            Email,
            Password,
            Error: '' //good practice to return empty string!
        });
    } catch (error) {
        console.error('Error during signup:', error);
        res.status(500).json({ error: 'An error occurred while signing up.' });
    }
});

app.post('/api/student/signup', async (req, res) => {
    const { School, Grad_Semester, Grad_Year, Bio, FirstName, LastName, Email, Password } = req.body;

    if (!School || !Grad_Semester || !Grad_Year || !FirstName || !LastName || !Email || !Password ) {
        return res.status(400).json({ error: 'All fields (School, Grad_Semester, Grad_Year, FirstName, LastName, Email, and Password ) are required.' });
    }

    try {
        const db = client.db('RecruitmentSystem');
        const studentsCollection = db.collection('Students');

        //check email exists in all database
        const recruitersCollection = db.collection('Recruiters');
        const existingRecruiter = await recruitersCollection.findOne({ Email });
        const existingStudent = await studentsCollection.findOne({ Email });

        if (existingRecruiter || existingStudent) {
            return res.status(400).json({ error: 'Email Already Taken.' });
        }

        const newStudent = {
            School,
            Grad_Semester,
            Grad_Year,
            Bio,
            Job_Performance: [],
            FirstName,
            LastName,
            Email,
            Password
        };

        const result = await studentsCollection.insertOne(newStudent);

        res.status(201).json({
            ID: result.insertedId,
            School,
            Grad_Semester,
            Grad_Year,
            Bio,
            Job_Performance: [],
            FirstName,
            LastName,
            Email,
            Password,
            Error: ''
        });
    } catch (error) {
        console.error('Error during signup:', error);
        res.status(500).json({ error: 'An error occurred while signing up.' });
    }
});


app.post('/api/login', async (req, res, next) => {
    try {
        const { email, password } = req.body;
        const db = client.db('RecruitmentSystem');

        //search from both collections 
        const [studentResult, recruiterResult] = await Promise.all([
            db.collection('Students').findOne({ Email: email, Password: password }),
            db.collection('Recruiters').findOne({ Email: email, Password: password })
        ]);

        let user = null;
        let role = '';

        if (studentResult) {
            user = studentResult;
            role = 'Student';
        } else if (recruiterResult) {
            user = recruiterResult;
            role = 'Recruiter';
        }

        if (!user) {
            return res.status(401).json({ error: 'Invalid Email or Password' });
        }

        // ---- Changed this part ---- //
        if (role === 'Recruiter') {
            res.status(200).json({
                ID: user._id,
                FirstName: user.FirstName,
                LastName: user.LastName,
                Events: user.Events,
                Role: role,
                Error: ''
            });
        } else {
            res.status(200).json({
                ID: user._id,
                FirstName: user.FirstName,
                LastName: user.LastName,
                Role: role,
                Error: ''
            });
        }
        // --------------------------- //

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

//POST Create a new job
app.post('/api/jobs', async (req, res) => {
    const { Title, Skills, Type } = req.body;

    // if (!Title || !Skills || !Type) {
    //     return res.status(400).json({ error: 'All fields (Title, Skills, Type) are required.' });
    // }
    // if (!Array.isArray(Skills)) {
    //     return res.status(400).json({ error: 'Skills must be an array.' });
    // }
    // if (!['Internship', 'Full Time'].includes(Type)) {
    //     return res.status(400).json({ error: 'Type must be either "Internship" or "Full Time".' });
    // }

    try {
        const db = client.db('RecruitmentSystem');
        const jobsCollection = db.collection('Jobs');

        const newJob = {
            Title,
            Skills,
            Type
        };

        const result = await jobsCollection.insertOne(newJob);

        res.status(201).json({
            _id: result.insertedId,
            Title,
            Skills,
            Type
        });
    } catch (error) {
        console.error('Error creating job:', error);
        res.status(500).json({ error: 'An error occurred while creating the job.' });
    }
});

// PUT update a job
app.put('/api/jobs/:id', async (req, res) => {
    const { id } = req.params;
    const { Title, Skills, Type } = req.body;

    // if (!Title || !Skills || !Type) {
    //     return res.status(400).json({ error: 'All fields (Title, Skills, Type) are required.' });
    // }
    // if (!Array.isArray(Skills)) {
    //     return res.status(400).json({ error: 'Skills must be an array.' });
    // }
    // if (!['Internship', 'Full Time'].includes(Type)) {
    //     return res.status(400).json({ error: 'Type must be either "Internship" or "Full Time".' });
    // }

    try {
        const db = client.db('RecruitmentSystem');
        const jobsCollection = db.collection('Jobs');

        const result = await jobsCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { Title, Skills, Type } }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ error: 'Job not found.' });
        }

        res.status(200).json({ message: 'Job updated successfully.' });
    } catch (error) {
        console.error('Error updating job:', error);
        res.status(500).json({ error: 'An error occurred while updating the job.' });
    }
});

// DELETE delete a job
app.delete('/api/jobs/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const db = client.db('RecruitmentSystem');
        const jobsCollection = db.collection('Jobs');

        const result = await jobsCollection.deleteOne({ _id: new ObjectId(id) });

        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'Job not found.' });
        }

        res.status(200).json({ message: 'Job deleted successfully.' });
    } catch (error) {
        console.error('Error deleting job:', error);
        res.status(500).json({ error: 'An error occurred while deleting the job.' });
    }
});

app.post('/api/generate-qr', async (req, res) => {
    try {

      // user is a json object, so need to extract the string
      const user = req.body;
      const userId = user.userId;

      if (!userId || typeof userId !== 'string') {
        return res.status(400).json({ error: 'Valid string userId required' });
      }
  
      const qrCodeData = userId.toString();
      const qrFilename = `${QR_DIR}/qr_${userId}.png`;
      const txtFilename = `${TXT_DIR}/user_${userId}.txt`;
  
      // Generate QR code
      const qrStream = qr.image(qrCodeData, { type: 'png' });
      const writeStream = fs.createWriteStream(qrFilename);
      
      qrStream.pipe(writeStream);
  
      // Wait for file write to complete
      await new Promise((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });
  
      // Create text file with user ID
      await fs.promises.writeFile(txtFilename, qrCodeData);
  
      res.json({
        success: true,
        message: 'QR code generated successfully',
        qrImage: `/qr_codes/qr_${userId}.png`,
        textFile: `/text_files/user_${userId}.txt`
      });
  
    } catch (error) {
      console.error('Error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // Serve generated files
  app.use('/qr_codes', express.static(QR_DIR));
  app.use('/text_files', express.static(TXT_DIR));

// ----------- My stuff ----------- //
const FormData = require('form-data');
const Mailgun = require('mailgun.js');
const mailgun = new Mailgun(FormData);
const crypto = require("crypto");
const { type } = require('os');

const mg = mailgun.client({username: 'api', key: process.env.API_KEY || "put_api_key_here"});

const verificationCodes = {};

app.post('/api/send-reset-code', async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(401).json({ error: "Email is required." });
    }

    try {
        const db = client.db('RecruitmentSystem');

        const [studentResult, recruiterResult] = await Promise.all([
            db.collection('Students').findOne({ Email: email }),
            db.collection('Recruiters').findOne({ Email: email })
        ]);

        if (!studentResult && !recruiterResult) {
            return res.status(404).json({ message: "Email not found." });
        }

        console.log("account was found");

        const code = crypto.randomInt(100000, 999999).toString();

        verificationCodes[email] = code;

        const data = await mg.messages.create("postmaster_email_here", {
            from: "Chimpr <postmaster_email_here>",
            to: [email],
            subject: "Password Reset",
            text: `Your password reset code is: ${code}.`,
            });

        console.log("email was sent");

        return res.status(200).json({ message: "Verification code sent." });

    } catch (error) {
        console.error("Error checking email:", error);
        res.status(500).json({ message: "Server error" });
    }
});

app.post('/api/verify-code', (req, res) => {
    const { email, code } = req.body;

    if (verificationCodes[email] && verificationCodes[email] === code) {
        delete verificationCodes[email];
        return res.json({ success: true, message: "Code verified" });
    }

    res.status(400).json({ message: "Invalid code" });
});

app.post('/api/change-password', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: "Email and/or password not found." });
    }

    try {
        const db = client.db('RecruitmentSystem');
        const studentsCollection = db.collection('Students');
        const recruitersCollection = db.collection('Recruiters');

        const [studentResult, recruiterResult] = await Promise.all([
            studentsCollection.findOne({ Email: email }),
            recruitersCollection.findOne({ Email: email })
        ]);

        if (!studentResult && !recruiterResult) {
            return res.status(404).json({ message: "Email not found." });
        }

        let updateResult = null;
        if (studentResult) {
            updateResult = await studentsCollection.updateOne(
                { Email: email },
                { $set: { Password: password } }
            );
        } else if (recruiterResult) {
            updateResult = await recruitersCollection.updateOne(
                { Email: email},
                { $set: { Password: password } }
            );
        }

        if (!updateResult || updateResult.matchedCount === 0) {
            return res.status(500).json({ message: "Error updatting password." });
        }

        res.json({ success: true, message: "Password changed." });
    } catch (error) {
        console.error("Error changing password: ", error);
        res.status(500).json({ message: "Server error." })
    }
});

// -------------------------------- //

const PORT = process.env.PORT || 5001;
app.listen(PORT, async () => {
    await connectToMongoDB();
    console.log(`Server is running on port ${PORT}`);
});