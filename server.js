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

const app = express();
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
    const { Title, Skills, Type } = req.body;

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
            Type,
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
  const { Name, Date} = req.body;

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
        Date
    };

    const result = await eventsCollection.insertOne(newEvent);

    res.status(201).json({
        _id: result.insertedId,
        Name,
        Date: newEvent.Date,
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
// should see what recruiters went to event and delete it from their arrays aas well!
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

//PUT create avg of scans for student
app.post('/api/student/job-performance', async (req, res) => {
  const { Student_ID} = req.body;

  try {
    const db = client.db('RecruitmentSystem');
    const scansCollection = db.collection('Scans');
    const studentsCollection = db.collection('Students');

    //retrieve all scans for student that matches student_id
    const studentScans = await scansCollection.find({ Student_ID }).toArray();

    let avgScore = 0;
    if (studentScans.length > 0) {
        const totalScore = studentScans.reduce((sum, scan) => sum + scan.Score, 0);
        avgScore = totalScore / studentScans.length;
    }

    let performanceLabel = '';
    if (avgScore <=50) {
        performanceLabel = 'not good';
    } else if (avgScore <=75) {
        performanceLabel = 'average';
    } else {
        performanceLabel = 'amazing';
    }

    // Update student's job performance
    await studentsCollection.updateOne(
        { Student_ID },
        { $set: { Job_Performance: { score: avgScore, rating: performanceLabel } } }
    );

    res.status(201).json({
        Error: ' ',
        Student_ID,
        Job_Performance: { score: avgScore, rating: performanceLabel },
    });
  } catch (error) {
      console.error('Error Updating Student Job Performance:', error);
      res.status(500).json({ error: 'An error occurred while updating Student Job Performance.' });
  }
});


//POST generate a qr code based on id
app.post('/api/generate-qr', async (req, res) => {
    try {
      const objectId = req.body.objectId;

    if (typeof objectId !== 'string' || !ObjectId.isValid(objectId)) {
      return res.status(400).json({ 
        error: 'Valid MongoDB ObjectID required (24-character hex string)' 
      });
    }
  
      const qrCodeData = objectId;
      const qrFilename = `${QR_DIR}/qr_${objectId}.png`;
      const txtFilename = `${TXT_DIR}/user_${objectId}.txt`;
  
      // Generate QR code
      const qrStream = qr.image(qrCodeData, { type: 'png' });
      const writeStream = fs.createWriteStream(qrFilename);
      
      qrStream.pipe(writeStream);
  
      // Wait for file write to complete
      await new Promise((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });
  
      // Create text file with object ID
      await fs.promises.writeFile(txtFilename, qrCodeData);
  
      res.json({
        success: true,
        message: 'QR code generated successfully',
        qrImage: `/qr_codes/qr_${objectId}.png`,
        textFile: `/text_files/user_${objectId}.txt`
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
      cb(null, 'uploads/resumes/'); 
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

// Upload Resume
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
        userId: new ObjectId(userId), 
        fileName: req.file.filename,
        originalName: req.file.originalname,
        path: req.file.path,
      };
  
      await resumesCollection.insertOne(newResume);
  
      res.status(201).json({
        message: 'Resume uploaded successfully!',
        resume: {
          id: newResume._id,
          fileName: newResume.fileName,
          path: newResume.path,
          originalName: newResume.originalName,
        },
      });
    } catch (error) {
      console.error('Error uploading resume:', error);
      res.status(500).json({ error: 'Failed to upload resume.' });
    }
});

//Get the resume
app.get('/api/resumes/:userId', async (req, res) => {
    try {
      const db = client.db('RecruitmentSystem');
      const resume = await db.collection('Resumes').findOne({
        userId: new ObjectId(req.params.userId),
      });
  
      if (!resume) return res.status(404).json({ error: 'The student has not submitted his resume' });
  
      res.status(200).json({
        id: resume._id,
        fileName: resume.fileName,
        originalName: resume.originalName,
        downloadUrl: `/uploads/resumes/${resume.fileName}`,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch resume.' });
    }
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, async () => {
    await connectToMongoDB();
    console.log(`Server is running on port ${PORT}`);
});