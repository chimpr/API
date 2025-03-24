const qr = require('qr-image');
const fs = require('fs');
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(bodyParser.json());

// Create directories for storing qr code
const QR_DIR = './qr_codes';
const TXT_DIR = './text_files';
const RESUME_DIR = './resumes';
fs.mkdirSync(QR_DIR, { recursive: true });
fs.mkdirSync(TXT_DIR, { recursive: true });
fs.mkdirSync(RESUME_DIR, { recursive: true });

const mongoURI = 'mongodb+srv://root:COP4331@cluster0.a7mcq.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0'; 
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

//POST signup for recruiter
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

//POST signup for student
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

//POST login for both student and recruiter
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

        res.status(200).json({
            ID: user._id,
            FirstName: user.FirstName,
            LastName: user.LastName,
            Role: role,
            Error: ''
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

//POST Create a new job
app.post('/api/jobs/create', async (req, res) => {
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

//PUT update a job
app.put('/api/jobs/update', async (req, res) => {
    const { id } = req.body;
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

//DELETE delete a job
app.delete('/api/jobs/delete', async (req, res) => {
    const { id } = req.body;

    // Validate if the id is a valid ObjectId before proceeding
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid job ID format.' });
    }

    try {
        const db = client.db('RecruitmentSystem');
        const jobsCollection = db.collection('Jobs');

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

    res.status(200).json({ message: 'Event Updated Successfully.' });

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
app.delete('/api/events/delete', async (req, res) => {
  const {id} = req.body;

  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ error: 'Invalid Event ID format.' });
  }

  try { 
    const db = client.db('RecruitmentSystem');
    const eventsCollection = db.collection('Events');

    const result = await eventsCollection.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
        return res.status(404).json({ error: 'Event Not Found!' });
    }
    
    res.status(200).json({ message: 'Error: " " '});
  } catch (error) {
      console.error('Error Creating Event:', error);
      res.status(500).json({ error: 'An error occurred while creating an event.' });
  }
});

//POST generate a qr code based on id
app.post('/api/generate-qr', async (req, res) => {
    try {
      // Validate and parse user ID
      const userId = Number(req.body.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ error: 'Valid numeric userId required' });
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