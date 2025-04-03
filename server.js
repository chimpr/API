const qr = require('qr-image');
const fs = require('fs');
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

//json token & hash password
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs'); 
const jwtSecret = 'G25COP4331';  //should go in .env tho!

//pdf
const pdfParse = require("pdf-parse");

//qr 
const FormData = require('form-data');
const Mailgun = require('mailgun.js');
const mailgun = new Mailgun(FormData);
const crypto = require("crypto");
const { type } = require('os');
const mg = mailgun.client({username: 'api', key: process.env.API_KEY || "put_api_key_here"});
const verificationCodes = {};

const app = express();
const cors = require('cors');
app.use(cors());
app.use(bodyParser.json());

// Create directories for storing qr code
const QR_DIR = './qr_codes';
const TXT_DIR = './text_files';
const RESUME_DIR = './resumes';
fs.mkdirSync(QR_DIR, { recursive: true });
fs.mkdirSync(TXT_DIR, { recursive: true });
fs.mkdirSync(RESUME_DIR, { recursive: true });

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

//POST login for both student and recruiter
app.post('/api/login', async (req, res, next) => {
  try {
      const { email, password } = req.body;
      const db = client.db('RecruitmentSystem');

      const lowerCaseEmail = email.toLowerCase();

      //search from both collections 
      const [studentResult, recruiterResult] = await Promise.all([
          db.collection('Students').findOne({ Email: lowerCaseEmail}),
          db.collection('Recruiters').findOne({ Email: lowerCaseEmail})
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

      //compare based on hashed password
      const isPasswordCorrect = await bcrypt.compare(password, user.Password);

      //not the right password!
      if (!isPasswordCorrect) {
        return res.status(403).json({ error: 'Invalid Password' });
      }

      //jwt token
      /*const token = jwt.sign(
        { id: user._id, email: user.Email, firstName: user.FirstName, lastName: user.LastName },
        jwtSecret,  // Use the hardcoded JWT secret
        { expiresIn: '1h' }      // Token expires in 1 hour
      );*/

      res.status(200).json({
          ID: user._id,
          FirstName: user.FirstName,
          LastName: user.LastName,
          Role: role,
          //token, //jwt token that should be stored within frontend
          Error: ''
      });

  } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Internal server error' });
  }
});

//middleware to verify jwt token
const verifyToken = (req, res, next) => {
  const token = req.header('Authorization')?.split(' ')[1];  

  if (!token) {
    return res.status(403).json({ error: 'Token is required' });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret);  //decode with jwtSecret
    req.user = decoded; 
    next(); 
  } catch (error) {
    console.error('Token verification failed:', error);
    return res.status(403).json({ error: 'Invalid or expired token' });  // Invalid token or expired
  }
};

//GET whenever json token is needed, run this!
app.get('/api/protected', verifyToken, (req, res) => {
  res.status(200).json({ message: 'This is a protected route', user: req.user });  // Send back user info
});

//POST signup for recruiter
app.post('/api/recruiter/signup', async (req, res) => {
    const { LinkedIn, Company, FirstName, LastName, Email, Password } = req.body;

    if (!LinkedIn || !Company || !FirstName || !LastName || !Email || !Password ) {
        return res.status(403).json({ error: 'All fields (LinkedIn, Company, FirstName, LastName, Email, and Password ) are required.' }); //need to psuh
    }

    try {
        const db = client.db('RecruitmentSystem');
        const recruitersCollection = db.collection('Recruiters');

        //check email exists in all database
        const studentsCollection = db.collection('Students');

        // Convert email to lowercase
        const lowerCaseEmail = Email.toLowerCase();
        const existingRecruiter = await recruitersCollection.findOne({ Email: lowerCaseEmail});
        const existingStudent = await studentsCollection.findOne({ Email: lowerCaseEmail });

        if (existingRecruiter || existingStudent) {
            return res.status(400).json({ error: 'Email Already Taken.' });
        }

        //hash password
        const hashedPassword = await bcrypt.hash(Password, 10); // 10 is the salt rounds

        const newRecruiter = {
            LinkedIn,
            Company,
            FirstName,
            LastName,
            Email: lowerCaseEmail,
            Password: hashedPassword
        };

        const result = await recruitersCollection.insertOne(newRecruiter);

        res.status(201).json({
            ID: result.insertedId,
            LinkedIn,
            Company,
            FirstName,
            LastName,
            Email: lowerCaseEmail,
            Error: '' //good practice to return empty string!
        });
    } catch (error) {
        console.error('Error during signup:', error);
        res.status(500).json({ error: 'An error occurred while signing up.' });
    }
});

//PUT update a recruiter
app.put('/api/recruiter/update', async (req, res) => {
  const { id } = req.body;
  const { LinkedIn, Company, FirstName, LastName} = req.body;

  try {
      const db = client.db('RecruitmentSystem');
      const recruiterCollection = db.collection('Recruiters');

      const result = await recruiterCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set:  { LinkedIn, Company, FirstName, LastName}}
      );

      if (result.matchedCount === 0) {
          return res.status(404).json({ error: 'Recruiter not found.' });
      }

      res.status(200).json({ message: 'Recruiter updated successfully.' });
  } catch (error) {
      console.error('Error updating Recruiter:', error);
      res.status(500).json({ error: 'An error occurred while updating the Recruiter.' });
  }
});

//GET recruiter details by ID
app.get('/api/recruiter/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const db = client.db('RecruitmentSystem');
    const recruitersCollection = db.collection('Recruiters');

    //retrieve all fields except password
    const recruiter = await recruitersCollection.findOne(
      { _id: new ObjectId(id) },
      { projection: { Password: 0 } }
    );

    if (!recruiter) {
      return res.status(404).json({ error: 'Recruiter Not Found' });
    }

    res.status(200).json(recruiter);

  } catch (error) {
    console.error('Error retrieving recruiter:', error);
    res.status(500).json({ error: 'An error occurred while retrieving the recruiter.' });
  }
});

//POST signup for student
app.post('/api/student/signup', async (req, res) => {
    const { School, Grad_Semester, Grad_Year, Bio, FirstName, LastName, Email, Password } = req.body;

    if (!School || !Grad_Semester || !Grad_Year || !FirstName || !LastName || !Email || !Password ) {
        return res.status(403).json({ error: 'All fields (School, Grad_Semester, Grad_Year, FirstName, LastName, Email, and Password ) are required.' }); //need to psuh
    }

    try {
        const db = client.db('RecruitmentSystem');
        const studentsCollection = db.collection('Students');

        //check email exists in all database
        const recruitersCollection = db.collection('Recruiters');

        const lowerCaseEmail = Email.toLowerCase();
        const existingRecruiter = await recruitersCollection.findOne({ Email: lowerCaseEmail });
        const existingStudent = await studentsCollection.findOne({ Email: lowerCaseEmail });

        if (existingRecruiter || existingStudent) {
            return res.status(400).json({ error: 'Email Already Taken.' });
        }

        //hash password
        const hashedPassword = await bcrypt.hash(Password, 10); // 10 is the salt rounds
        
        const newStudent = {
            School,
            Grad_Semester,
            Grad_Year,
            Bio,
            Job_Performance: [],
            FirstName,
            LastName,
            Email: lowerCaseEmail,
            Password: hashedPassword
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
            Email: lowerCaseEmail,
            Error: ''
        });
    } catch (error) {
        console.error('Error during signup:', error);
        res.status(500).json({ error: 'An error occurred while signing up.' });
    }
});

//PUT update a student
app.put('/api/student/update', async (req, res) => {
  const { id } = req.body;
  const { School, Grad_Semester, Grad_Year, Bio, FirstName, LastName} = req.body;

  try {
      const db = client.db('RecruitmentSystem');
      const studentCollection = db.collection('Students');

      const result = await studentCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { School, Grad_Semester, Grad_Year, Bio, FirstName, LastName} }
      );

      if (result.matchedCount === 0) {
          return res.status(404).json({ error: 'Student not found.' });
      }

      res.status(200).json({ message: 'Student updated successfully.' });
  } catch (error) {
      console.error('Error updating Student:', error);
      res.status(500).json({ error: 'An error occurred while updating the Student.' });
  }
});

//GET student details by ID
app.get('/api/student/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const db = client.db('RecruitmentSystem');
    const studentsCollection = db.collection('Students');

    //retrieve all fields except password
    const student = await studentsCollection.findOne(
      { _id: new ObjectId(id) },
      { projection: { Password: 0 } }
    );

    if (!student) {
      return res.status(404).json({ error: 'Student Not Found' });
    }

    res.status(200).json(student);

  } catch (error) {
    console.error('Error retrieving student:', error);
    res.status(500).json({ error: 'An error occurred while retrieving the student.' });
  }
});

//POST Create a new job
app.post('/api/jobs/create', async (req, res) => {
    const { Title, Skills, Type, Recruiter_ID } = req.body;

    if (!ObjectId.isValid(Recruiter_ID)) {
      return res.status(404).json({ error: 'Invalid Recruiter_ID format.' });
    }

    try {
        const db = client.db('RecruitmentSystem');
        const jobsCollection = db.collection('Jobs');

        const newJob = {
            Title,
            Skills,
            Type, 
            Recruiter_ID
        };

        const result = await jobsCollection.insertOne(newJob);

        res.status(201).json({
            _id: result.insertedId,
            Title,
            Skills,
            Type,
            Recruiter_ID,
            Error: ''
        });
    } catch (error) {
        console.error('Error creating job:', error);
        res.status(500).json({ error: 'An error occurred while creating the job.' });
    }
});

//PUT update a job
app.put('/api/jobs/update', async (req, res) => {
    const { id } = req.body;
    const { Title, Skills, Type } = req.body;

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

//DELETE delete a job
app.delete('/api/jobs/delete/:id', async (req, res) => {
    const { id } = req.params;

    // Validate if the id is a valid ObjectId before proceeding
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid job ID format.' });
    }

    try {
        const db = client.db('RecruitmentSystem');
        const jobsCollection = db.collection('Jobs');

        const job = await jobsCollection.findOne({ _id: new ObjectId(id) });

        if (!job) {
            return res.status(404).json({ error: 'Job not found.' });
        }

        const result = await jobsCollection.deleteOne({ _id: new ObjectId(id) });

        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'Job not found.' });
        }
        
        console.log('Job to be deleted:', job);
        res.status(200).json({ message: 'Job deleted successfully.' });
    } catch (error) {
        console.error('Error deleting job:', error);
        res.status(500).json({ error: 'An error occurred while deleting the job.' });
    }
});

//GET job details by ID
app.get('/api/jobs/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const db = client.db('RecruitmentSystem');
    const jobsCollection = db.collection('Jobs');

    const job = await jobsCollection.findOne({ _id: new ObjectId(id) });

    if (!job) {
      return res.status(404).json({ error: 'Job Not Found' });
    }

    res.status(200).json(job);

  } catch (error) {
    console.error('Error retrieving job:', error);
    res.status(500).json({ error: 'An error occurred while retrieving the job.' });
  }
});

//POST create a new event
app.post('/api/events/create', async (req, res) => {
  const { Name, Date, Recruiter_ID} = req.body;

  if (!ObjectId.isValid(Recruiter_ID)) {
    return res.status(404).json({ error: 'Invalid Recruiter_ID format.' });
  
  }
  try { 
    //validate the date format
    const dateRegex = /^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])-\d{4}$/;
    if (!dateRegex.test(Date)) {
        return res.status(400).json({ error: 'Invalid date format. Please use the format MM-DD-YYYY.' });
    }

    const db = client.db('RecruitmentSystem');
    const eventsCollection = db.collection('Events');

    const newEvent = {
        Name,
        Date, 
        Recruiter_ID
    };

    const result = await eventsCollection.insertOne(newEvent);

    res.status(201).json({
        _id: result.insertedId,
        Name,
        Date: newEvent.Date,
        Recruiter_ID,
        Error: ''
    });
  } catch (error) {
      console.error('Error Creating Event:', error);
      res.status(500).json({ error: 'An error occurred while creating an event.' });
  }
});

//PUT update an event
app.put('/api/events/update', async (req, res) => {
  const { id } = req.body;
  const { Name, Date} = req.body;

  try { 
    //validate the date format
    const dateRegex = /^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])-\d{4}$/;
    if (!dateRegex.test(Date)) {
        return res.status(400).json({ error: 'Invalid date format. Please use the format MM-DD-YYYY.' });
    }

    const db = client.db('RecruitmentSystem');
    const eventsCollection = db.collection('Events');

    const result = await eventsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { Name, Date} }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Event Not Found!' });
    }

    res.status(201).json({
        _id: result.insertedId,
        Name,
        Date: result.Date,
        Error: ''
    });
  } catch (error) {
      console.error('Error Updating Event:', error);
      res.status(500).json({ error: 'An error occurred while updating an event.' });
  }
});

//DELETE delete an event
app.delete('/api/events/delete/:id', async (req, res) => {
  const {id} = req.params;

  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ error: 'Invalid Event ID format.' });
  }

  try { 
    const db = client.db('RecruitmentSystem');
    const eventsCollection = db.collection('Events');

    const event = await eventsCollection.findOne({ _id: new ObjectId(id) });

    if (!event) {
        return res.status(404).json({ error: 'Event not found.' });
    }

    const result = await eventsCollection.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
        return res.status(404).json({ error: 'Event Not Found!' });
    }
    
    console.log('Event to be deleted:', event);
    res.status(200).json({ message: 'Event deleted successfully.' });
  } catch (error) {
      console.error('Error Creating Event:', error);
      res.status(500).json({ error: 'An error occurred while creating an event.' });
  }
});

//GET event details by ID
app.get('/api/events/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const db = client.db('RecruitmentSystem');
    const eventsCollection = db.collection('Events');

    const event = await eventsCollection.findOne({ _id: new ObjectId(id) });

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    res.status(200).json(event);

  } catch (error) {
    console.error('Error retrieving event:', error);
    res.status(500).json({ error: 'An error occurred while retrieving the event.' });
  }
});

//GET all events that match the recruiter id
//needs to be tested
app.get('/api/event/list/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const db = client.db('RecruitmentSystem');
    const eventsCollection = db.collection('Events');

    //retrieve all events that match the recruiter id
    const events = await eventsCollection.find({ Recruiter_ID: id }).toArray();

    res.status(200).json({
        Error: ' ',
        Recruiter_ID: id,
        events
    });
  } catch (error) {
      console.error('Error getting events based on recruiter id :', error);
      res.status(500).json({ error: 'An error occurred while getting events based on recruiter id.' });
  }
});

//POST create scans
app.post('/api/scans', async (req, res) => {
  const { Student_ID, Recruiter_ID, Score } = req.body;

  try {
    const db = client.db('RecruitmentSystem');
    const scansCollection = db.collection('Scans');

    const newScan = {
      Student_ID, 
      Recruiter_ID, 
      Score
    };

    const result = await scansCollection.insertOne(newScan);

    res.status(201).json({
        _id: result.insertedId,
        Student_ID,
        Recruiter_ID,
        Score,
        Error: ''
    });

  } catch (error) {
      console.error('Error creating Scan:', error);
      res.status(500).json({ error: 'An error occurred while creating the scan.' });
  }
});

//POST total scores for jobs and job performance of student
app.post("/api/match-resume/", async (req, res) => {
  const{Recruiter_ID, Student_ID, Score} = req.body

  try {
      const db = client.db("RecruitmentSystem");
      const jobsCollection = db.collection("Jobs");
      const studentsCollection = db.collection("Students");
      const resumesCollection = db.collection("Resumes");

      //get student's resume
      const resume = await resumesCollection.findOne({ userId: Student_ID});
      if (!resume) {
        return res.status(404).json({ error: 'The student has not submitted his resume' });
      }
      
      const filePath = resume.Path;
      console.log(filePath);

      //get all jobs pertaining to recruiter id
      const jobs = await jobsCollection.find({ Recruiter_ID: Recruiter_ID }).toArray();
      const totalJobs = jobs.length;
      console.log("total jobs " + totalJobs);

      //variables & left
      const left = (0.25) * ((Score/5) * 100); // 5 = full 25%
      console.log("left " + left);

      let total = 0;

      for (const job of jobs) {
          console.log("Job Document:", job);
          const jobSkills = job.Skills || []; 
          console.log("Job Skills Array:", jobSkills);
          const amountSkills = jobSkills.length;
          console.log("amountSkills " + amountSkills);

          const matchCount = await checkSkillsInPDF(filePath, jobSkills); //helper function to get matchedskills
          console.log("matchCount " + matchCount);

          if(matchCount == null)
          {
            return res.status(404).json({ error: "Error: Unable to Read PDF" });
          }

          const right = amountSkills > 0 ? (0.75) * ((matchCount/ amountSkills) * 100) : 0;        
          console.log("right " + right);
          const totalJobScore = left + right;
          console.log("totalJobScore "  + totalJobScore);

          //add new candidate in job
          const result = await jobsCollection.updateOne(
            { _id: new ObjectId(job._id) },
            { $push: { Top_Candidates: { Student_ID: Student_ID, Score:totalJobScore } } } 
          );
        
          total += totalJobScore;
      }
      total = total / totalJobs;
      console.log(total);

      const student = await studentsCollection.findOne({ _id: new ObjectId(Student_ID) });
      if (!student) {
        console.log("check student");
        return res.status(404).json({ error: "Student not found." });
      }
    
      const jobPerformance = student.Job_Performance;
      console.log(jobPerformance);
      
      if (!jobPerformance || jobPerformance.length < 2) {
          return res.status(404).json({ error: "Job performance data is incomplete for this student." });
      }
      
      const before_score = jobPerformance[0];
      const after_score = ( jobPerformance[0] + total ) / 2
      console.log(after_score);

      let performanceLabel = '';
      if (after_score <=50) {
          performanceLabel = 'Not Good';
      } else if (after_score <=75) {
          performanceLabel = 'Average';
      } else {
          performanceLabel = 'Amazing';
      }

      // Update student's job performance
      const result  = await studentsCollection.updateOne(
          { _id : new ObjectId(Student_ID)},
          { $set: { Job_Performance: [after_score, performanceLabel] } }
      );
     
      console.log("Update Result:", result);

      res.status(200).json({
        Error: ' ',
        Before_Job_Performance: before_score,
        After_Job_Performance: after_score
      });

  } catch (error) {
      console.error("Error processing score calculation of job performance:", error);
      res.status(500).json({ error: "An error occurred while matching skills with resume." });
  }
});


//tested with match-resume
async function checkSkillsInPDF(filePath, jobSkills) {
  try {
      console.log("skills: " + jobSkills);
      console.log("inside check skills");
      if (!fs.existsSync(filePath)) {
        console.error("Error: File does not exist at path:", filePath);
        return null;
      }

      console.log("Before parsing PDF...");
      const pdfBuffer = fs.readFileSync(filePath);
      const pdfData = await pdfParse(pdfBuffer);
      console.log("After parsing PDF...");
      console.log("Extracted text:", pdfData.text.substring(0, 200)); // Show only the first 200 chars
      const pdfText = pdfData.text.toLowerCase();
  

      let matchCount = 0;
      let foundSkills = new Set(); //prevent duplicate counting

      //loop through each skill in jobSkills array
      jobSkills.forEach(skill => {
          const regex = new RegExp(`\\b${skill.toLowerCase()}\\b`, "g");
          if (regex.test(pdfText)) {
              foundSkills.add(skill.toLowerCase()); //add skill to set
          }
      });

      //count of unique matched skills 
      matchCount = foundSkills.size;

      return matchCount;

  } catch (error) {
      console.error("Error reading PDF:", error);
      return null; 
  }
}

//POST generate a qr code based on id
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


// Configure Multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, './resumes/'); 
    },
    filename: (req, file, cb) => {
      const uniqueName = `resume-${uuidv4()}${path.extname(file.originalname)}`;
      cb(null, uniqueName);
    },
  });

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // If we need to change file size change the first number here (Current is set to 5mb)
    fileFilter: (req, file, cb) => {
      if (file.mimetype === 'application/pdf') {
        cb(null, true);
      } else {
        cb(new Error('Only PDF files are allowed!'), false);
      }
    },
});

//POST upload Resume
app.post('/api/upload-resume', upload.single('resume'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded.' });
      }
      const { userId } = req.body; 
  
      if (!userId) {
        return res.status(400).json({ error: 'User ID is required.' });
      }
  
      const db = client.db('RecruitmentSystem');
      const resumesCollection = db.collection('Resumes');
  
      const newResume = {
        userId: userId, 
        FileName: req.file.filename,
        OriginalName: req.file.originalname,
        Path: req.file.path,
      };
  
      await resumesCollection.insertOne(newResume);
  
      res.status(201).json({
        message: 'Resume uploaded successfully!',
        resume: {
          id: newResume._id,
          FileName: newResume.FileName,
          Path: newResume.Path,
          OriginalName: newResume.OriginalName,
        },
      });
    } catch (error) {
      console.error('Error uploading resume:', error);
      res.status(500).json({ error: 'Failed to upload resume.' });
    }
});

//GET the resume
app.get('/api/resumes/:userId', async (req, res) => {
  const { userId } = req.params;

    try {
      const db = client.db('RecruitmentSystem');
      const resume = await db.collection('Resumes').findOne({
        userId: userId // Query with the string userId
      });

  
      if (!resume) return res.status(404).json({ error: 'The student has not submitted his resume' });
  
      res.status(200).json({
        id: resume._id,
        fileName: resume.FileName,
        originalName: resume.OriginalName,
        downloadUrl: `./resumes/${resume.FileName}`,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch resume.' });
    }
});

//POST forgot password
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

//POST email verification
app.post('/api/verify-code', (req, res) => {
    const { email, code } = req.body;

    if (verificationCodes[email] && verificationCodes[email] === code) {
        delete verificationCodes[email];
        return res.json({ success: true, message: "Code verified" });
    }

    res.status(400).json({ message: "Invalid code" });
});

//POST updating password
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


const PORT = process.env.PORT || 5001;
app.listen(PORT, async () => {
    await connectToMongoDB();
    console.log(`Server is running on port ${PORT}`);
});