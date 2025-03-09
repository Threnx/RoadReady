/***************************************************
 * FILE: server.js
 ***************************************************/
const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const app = express();
const sequelize = require('./db');

// Existing Models
const User = require('./models/User');
const Lesson = require('./models/Lesson');
const Payment = require('./models/Payment');
const Review = require('./models/Review');
const Message = require('./models/Message');
const StudentReview = require('./models/StudentReview');
const Notification = require('./models/Notification');
const InstructorStudent = require('./models/InstructorStudent');
const LessonPlan = require('./models/LessonPlan');

// NEW: Import Competency and StudentCompetency
const Competency = require('./models/Competency');
const StudentCompetency = require('./models/StudentCompetency');

const bcrypt = require('bcrypt');
const session = require('express-session');
const { Op, fn, col } = require('sequelize');

/***************************************************
 * 1) SETUP VIEW ENGINE & EXPRESS-EJS-LAYOUTS
 ***************************************************/
app.set('view engine', 'ejs');
app.use(expressLayouts); // automatically uses views/layout.ejs

// Serve static files from "public" folder
app.use(express.static('public'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

/***************************************************
 * 2) SESSION
 ***************************************************/
app.use(session({
  secret: 'your_secret_key_here',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

/***************************************************
 * 3) AUTH HELPERS
 ***************************************************/
function requireLogin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role !== 'blocked' && req.session.userActive !== false) {
    return next();
  }
  res.redirect('/login');
}

function requireInstructor(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'instructor' && req.session.user.role !== 'blocked') {
    return next();
  }
  res.status(403).send('Forbidden. Only instructors can access this page.');
}

function requireStudent(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'student' && req.session.user.role !== 'blocked') {
    return next();
  }
  res.status(403).send('Forbidden. Only students can access this page.');
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'admin') {
    return next();
  }
  res.status(403).send('Forbidden. Admins only.');
}

/***************************************************
 * 4) MISC HELPERS
 ***************************************************/
// Dummy email function
async function sendEmail(to, subject, text) {
  console.log(`(Email disabled) Email to ${to}: ${subject}\n${text}`);
}

// Real-time notifications
async function sendNotification(userId, message) {
  // 1) Save to DB
  await Notification.create({ userId, message });

  // 2) Emit via Socket.io (if available)
  const io = app.locals.io;
  if (io) {
    // Broadcast to everyone (or refine to a specific user if you track rooms)
    io.emit('notification', { userId, message });
  }
}

// Check if user is active
async function loadUserActiveStatus(req, res, next) {
  if (req.session.user) {
    const u = await User.findByPk(req.session.user.id);
    if (!u || !u.active) {
      req.session.destroy(err => {});
      return res.status(403).send('Your account is blocked.');
    }
    req.session.userActive = u.active;
  }
  next();
}
app.use(loadUserActiveStatus);

// Make `user` available to all templates
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

/**
 * We'll store success/failure messages in req.session
 * and pass them to res.locals so they're displayed once and cleared.
 */
app.use((req, res, next) => {
  res.locals.successMessage = req.session.successMessage || null;
  res.locals.errorMessage = req.session.errorMessage || null;
  delete req.session.successMessage;
  delete req.session.errorMessage;
  next();
});

/***************************************************
 * 5) ROUTES
 ***************************************************/
// LANDING PAGE
app.get('/', (req, res) => {
  res.render('index', { title: 'Home' });
});

// ADMIN PAGE
app.get('/admin', requireLogin, requireAdmin, async (req, res) => {
  const q = req.query.q || '';
  let whereClause = {};

  if (q) {
    whereClause[Op.or] = [
      sequelize.where(fn('LOWER', col('name')), { [Op.like]: `%${q.toLowerCase()}%` }),
      sequelize.where(fn('LOWER', col('email')), { [Op.like]: `%${q.toLowerCase()}%` })
    ];
  }

  const users = await User.findAll({
    where: whereClause,
    order: [['name', 'ASC']]
  });

  res.render('admin', { title: 'Admin Dashboard', q, users });
});

app.post('/admin/block/:id', requireLogin, requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const u = await User.findByPk(userId);
    if (!u) throw new Error('User not found');

    u.active = false;
    await u.save();

    req.session.successMessage = `User "${u.name}" blocked successfully.`;
    res.redirect('/admin');
  } catch (error) {
    req.session.errorMessage = error.message || 'Error blocking user.';
    res.redirect('/admin');
  }
});

app.post('/admin/unblock/:id', requireLogin, requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const u = await User.findByPk(userId);
    if (!u) throw new Error('User not found');

    u.active = true;
    await u.save();

    req.session.successMessage = `User "${u.name}" unblocked successfully.`;
    res.redirect('/admin');
  } catch (error) {
    req.session.errorMessage = error.message || 'Error unblocking user.';
    res.redirect('/admin');
  }
});

// Delete user
app.post('/admin/delete/:id', requireLogin, requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const user = await User.findByPk(userId);
    if (!user) throw new Error('User not found');

    await user.destroy();
    req.session.successMessage = `User "${user.name}" deleted successfully.`;
    res.redirect('/admin');
  } catch (error) {
    req.session.errorMessage = error.message || 'Error deleting user.';
    res.redirect('/admin');
  }
});

// NOTIFICATIONS
app.get('/notifications', requireLogin, async (req, res) => {
  const notifications = await Notification.findAll({
    where: { userId: req.session.user.id },
    order: [['createdAt', 'DESC']]
  });
  res.render('notifications', { title: 'Notifications', notifications });
});

app.post('/notifications/mark-read', requireLogin, async (req, res) => {
  const { notificationId } = req.body;
  const notif = await Notification.findOne({ where: { id: notificationId, userId: req.session.user.id }});
  if (!notif) return res.status(404).send('Notification not found');
  notif.read = true;
  await notif.save();
  res.redirect('/notifications');
});

// INSTRUCTORS LISTING
app.get('/instructors', requireLogin, async (req, res) => {
  try {
    const q = req.query.q ? req.query.q.toLowerCase() : '';
    const postcodeQuery = req.query.postcode ? req.query.postcode.toLowerCase() : '';
    const minPrice = req.query.minPrice ? parseFloat(req.query.minPrice) : null;
    let whereClause = { role: 'instructor', active: true };

    const orConditions = [];
    if (q) {
      orConditions.push(
        sequelize.where(fn('LOWER', col('name')), { [Op.like]: `%${q}%` }),
        sequelize.where(fn('LOWER', col('carType')), { [Op.like]: `%${q}%` })
      );
    }
    if (postcodeQuery) {
      orConditions.push(
        sequelize.where(fn('LOWER', col('postcode')), { [Op.like]: `%${postcodeQuery}%` })
      );
    }
    if (orConditions.length > 0) {
      whereClause[Op.or] = orConditions;
    }
    if (minPrice !== null && !isNaN(minPrice)) {
      whereClause.lessonPrice = { [Op.gte]: minPrice };
    }

    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;

    const totalInstructors = await User.count({ where: whereClause });
    const instructors = await User.findAll({
      where: whereClause,
      order: [['name', 'ASC']],
      include: [{ model: Review, as: 'ReceivedReviews' }],
      limit,
      offset
    });

    const instructorsData = instructors.map(instr => {
      const reviews = instr.ReceivedReviews;
      const avgRating = reviews && reviews.length > 0
        ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
        : 'No ratings yet';
      return {
        id: instr.id,
        name: instr.name,
        email: instr.email,
        carType: instr.carType,
        lessonPrice: instr.lessonPrice,
        avgRating,
        reviews: reviews.slice(0,3),
        postcode: instr.postcode,
        onHoliday: instr.onHoliday,
        availability: instr.availability ? JSON.parse(instr.availability) : null
      };
    });

    const totalPages = Math.ceil(totalInstructors / limit);

    res.render('instructors', {
      title: 'Browse Instructors',
      instructors: instructorsData,
      q,
      postcode: postcodeQuery,
      page,
      totalPages,
      limit,
      minPrice
    });
  } catch (error) {
    console.error('Error fetching instructors:', error);
    res.status(500).send('Unable to fetch instructors.');
  }
});

// INSTRUCTOR COMPETENCIES (UPDATING STUDENT COMPETENCY)
app.post('/instructor/competencies/update', requireLogin, requireInstructor, async (req, res) => {
  try {
    const { studentId, competencyId, status } = req.body;
    
    // Check if the student is real, etc.
    const student = await User.findOne({ where: { id: studentId, role: 'student' } });
    if (!student) return res.status(404).send('Student not found');

    // Upsert a record in StudentCompetency
    let record = await StudentCompetency.findOne({
      where: { studentId: student.id, competencyId }
    });
    if (!record) {
      record = await StudentCompetency.create({
        studentId: student.id,
        competencyId,
        status
      });
    } else {
      record.status = status;
      await record.save();
    }

    res.redirect('/instructor'); // or some success message
  } catch (error) {
    console.error('Error updating competency:', error);
    res.status(500).send('Error updating competency.');
  }
});

// INSTRUCTOR AVAILABILITY
app.get('/instructor/:id/availability', requireLogin, requireStudent, async (req, res) => {
  const instructorId = parseInt(req.params.id, 10);
  const instructor = await User.findOne({ where: { id: instructorId, role: 'instructor' } });
  if (!instructor) return res.status(404).send('Instructor not found.');

  const availability = instructor.availability ? JSON.parse(instructor.availability) : {};
  res.render('availability', {
    title: 'Instructor Availability',
    instructor,
    availability
  });
});

app.post('/instructor/:id/book', requireLogin, requireStudent, async (req, res) => {
  // handle booking logic
  res.send('Lesson booked! (placeholder)');
});

// INSTRUCTOR ROSTER
app.get('/instructor/roster', requireLogin, requireInstructor, async (req, res) => {
  const instructorId = req.session.user.id;
  const pending = await InstructorStudent.findAll({
    where: { instructorId, status: 'pending' },
    include: [{ model: User, as: 'Student' }]
  });
  const accepted = await InstructorStudent.findAll({
    where: { instructorId, status: 'accepted' },
    include: [{ model: User, as: 'Student' }]
  });

  res.render('instructor-roster', {
    title: 'Instructor Roster',
    pending,
    accepted
  });
});

app.post('/instructor/roster/:id/accept', requireLogin, requireInstructor, async (req, res) => {
  // accept logic
  res.send('Accepted roster request (placeholder)');
});

app.post('/instructor/roster/:id/decline', requireLogin, requireInstructor, async (req, res) => {
  // decline logic
  res.send('Declined roster request (placeholder)');
});

// INSTRUCTOR CALENDAR
app.get('/instructor/calendar', requireLogin, requireInstructor, (req, res) => {
  res.render('instructor-calendar', { title: 'Instructor Calendar' });
});

// GET /instructor
app.get('/instructor', requireLogin, requireInstructor, async (req, res) => {
  try {
    const instructorId = req.session.user.id;
    const instructor = await User.findByPk(instructorId);

    const upcomingLessons = await Lesson.findAll({
      where: { instructorId, status: 'upcoming' },
      include: [{ model: User, as: 'Student' }]
    });
    const completedLessons = await Lesson.findAll({
      where: { instructorId, status: 'completed' },
      include: [{ model: User, as: 'Student' }]
    });

    const studentIds = new Set();
    upcomingLessons.forEach(l => studentIds.add(l.studentId));
    completedLessons.forEach(l => studentIds.add(l.studentId));

    const studentsForMessaging = await User.findAll({
      where: { id: Array.from(studentIds) }
    });

    let parsedAvailability = null;
    if (instructor.availability) {
      try {
        parsedAvailability = JSON.parse(instructor.availability);
      } catch (err) {
        console.error('Error parsing instructor availability:', err);
      }
    }

    let carTypeArray = [];
    if (Array.isArray(instructor.carType)) {
      carTypeArray = instructor.carType;
    } else if (typeof instructor.carType === 'string') {
      carTypeArray = instructor.carType.split(',');
    }

    const instructorData = {
      ...instructor.get({ plain: true }),
      availability: parsedAvailability,
      carType: carTypeArray
    };

    res.render('instructor', {
      title: 'Instructor Dashboard',
      instructor: instructorData,
      upcomingLessons,
      completedLessons,
      studentsForMessaging
    });
  } catch (error) {
    console.error('Error fetching instructor data:', error);
    res.status(500).send('Unable to fetch data.');
  }
});

// POST /instructor/profile/update
app.post('/instructor/profile/update', requireLogin, requireInstructor, async (req, res) => {
  const instructorId = req.session.user.id;
  const {
    'carType[]': carTypeArray,
    costManual,
    costAutomatic,
    costStudentCar,
    onHoliday,
    availability
  } = req.body;

  try {
    const instructor = await User.findByPk(instructorId);
    if (!instructor) return res.status(404).send('Instructor not found.');

    let finalCarType = [];
    if (Array.isArray(carTypeArray)) {
      finalCarType = carTypeArray;
    } else if (typeof carTypeArray === 'string') {
      finalCarType = [carTypeArray];
    }

    const parsedCostManual = costManual ? parseFloat(costManual) : null;
    const parsedCostAuto = costAutomatic ? parseFloat(costAutomatic) : null;
    const parsedCostStudentCar = costStudentCar ? parseFloat(costStudentCar) : null;

    const isOnHoliday = (onHoliday === 'on');

    const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
    let finalAvailability = {};
    days.forEach(day => {
      if (availability && availability[day]) {
        const dayData = availability[day];
        finalAvailability[day] = {
          available: !!dayData.available,
          start: dayData.start || '',
          end: dayData.end || ''
        };
      } else {
        finalAvailability[day] = { available: false, start:'', end:'' };
      }
    });

    instructor.carType = finalCarType;
    instructor.costManual = parsedCostManual;
    instructor.costAutomatic = parsedCostAuto;
    instructor.costStudentCar = parsedCostStudentCar;
    instructor.onHoliday = isOnHoliday;
    instructor.availability = JSON.stringify(finalAvailability);

    await instructor.save();
    res.redirect('/instructor');
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).send('An error occurred while updating your profile.');
  }
});

// STUDENT CANCEL / RESCHEDULE
app.post('/student/lessons/:id/cancel', requireLogin, requireStudent, async (req, res) => {
  const lessonId = parseInt(req.params.id, 10);
  const studentId = req.session.user.id;

  const lesson = await Lesson.findOne({ where: { id: lessonId, studentId, status: 'upcoming' } });
  if (!lesson) return res.status(404).send('Lesson not found or not upcoming.');

  const now = new Date();
  const diff = lesson.date - now;
  if (diff < 24*60*60*1000) {
    return res.status(400).send('Cannot cancel less than 24 hours before lesson start.');
  }

  lesson.status = 'canceled';
  await lesson.save();
  await sendNotification(lesson.instructorId, `A student canceled their lesson on ${lesson.date.toLocaleString()}.`);
  res.redirect('/student');
});

app.post('/student/lessons/:id/reschedule', requireLogin, requireStudent, async (req, res) => {
  const lessonId = parseInt(req.params.id, 10);
  const studentId = req.session.user.id;
  const { timeslot, lessonDate } = req.body;

  const lesson = await Lesson.findOne({ where: { id: lessonId, studentId, status: 'upcoming' } });
  if (!lesson) return res.status(404).send('Lesson not found or not upcoming.');

  const instructor = await User.findOne({ where: { id: lesson.instructorId, role: 'instructor' } });
  if (!instructor || instructor.onHoliday) {
    return res.status(403).send('Instructor not available or on holiday.');
  }
  if (!instructor.availability) return res.status(403).send('Instructor has no availability.');

  const availability = JSON.parse(instructor.availability);
  const [day, slot] = timeslot.split(':');
  if (!availability[day] || !availability[day].includes(slot)) {
    return res.status(400).send('Selected timeslot not in instructor availability.');
  }

  const chosenDate = new Date(lessonDate);
  if (isNaN(chosenDate.getTime())) {
    return res.status(400).send('Invalid date chosen.');
  }

  const weekdayMap = {
    sunday:0, monday:1, tuesday:2, wednesday:3, thursday:4, friday:5, saturday:6
  };
  const targetDay = weekdayMap[day];
  if (chosenDate.getDay() !== targetDay) {
    return res.status(400).send(`Chosen date does not match ${day}.`);
  }

  const [startTime, endTime] = slot.split('-');
  const [startHour, startMin] = startTime.split(':').map(x=>parseInt(x,10));
  const [endHour, endMin] = endTime.split(':').map(x=>parseInt(x,10));

  const lessonStart = new Date(chosenDate);
  lessonStart.setHours(startHour, startMin, 0, 0);

  const lessonEnd = new Date(chosenDate);
  lessonEnd.setHours(endHour, endMin, 0, 0);

  const conflict = await Lesson.findOne({
    where: {
      instructorId: instructor.id,
      status: 'upcoming',
      id: { [Op.ne]: lesson.id },
      [Op.and]: [
        { date: { [Op.lt]: lessonEnd } },
        { endDate: { [Op.gt]: lessonStart } }
      ]
    }
  });
  if (conflict) {
    return res.status(400).send('Timeslot conflicts with another lesson.');
  }

  lesson.date = lessonStart;
  lesson.endDate = lessonEnd;
  lesson.notes = `${day}:${slot}`;
  await lesson.save();
  await sendNotification(instructor.id, `A student rescheduled their lesson to ${lessonStart.toLocaleString()}.`);
  res.redirect('/student');
});

// STUDENT DASHBOARD
app.get('/student', requireLogin, requireStudent, async (req, res) => {
  try {
    const studentId = req.session.user.id;
    const upcomingLessons = await Lesson.findAll({
      where: { studentId, status: 'upcoming' },
      include: [
        { model: User, as: 'Instructor' },
        { model: Payment, as: 'Payments' }
      ]
    });
    const completedLessons = await Lesson.findAll({
      where: { studentId, status: 'completed' },
      include: [{ model: User, as: 'Instructor' }]
    });

    const instructorIds = new Set();
    upcomingLessons.forEach(l => instructorIds.add(l.instructorId));
    completedLessons.forEach(l => instructorIds.add(l.instructorId));

    const instructorsForMessaging = await User.findAll({
      where: { id: Array.from(instructorIds) }
    });

    const writtenReviews = await Review.findAll({ where: { studentId } });
    const reviewedInstructorIds = new Set(writtenReviews.map(r => r.instructorId));

    res.render('student', {
      title: 'Student Dashboard',
      upcomingLessons,
      completedLessons,
      reviewedInstructorIds,
      instructorsForMessaging
    });
  } catch (error) {
    console.error('Error fetching student data:', error);
    res.status(500).send('Unable to fetch lessons.');
  }
});

// STUDENT PROGRESS
app.get('/student/progress', requireLogin, requireStudent, async (req, res) => {
  const studentId = req.session.user.id;
  // fetch student's competency records
  const records = await StudentCompetency.findAll({
    where: { studentId },
    include: [{ model: Competency }] // so we get record.Competency.name
  });

  const total = records.length;
  const mastered = records.filter(r => r.status === 'mastered').length;
  const progress = total > 0 ? Math.round((mastered / total) * 100) : 0;

  res.render('student-progress', {
    title: 'My Driving Progress',
    records,
    progress
  });
});

// STUDENT LESSON PLANS
app.get('/student/plans', requireLogin, requireStudent, async (req, res) => {
  try {
    const studentId = req.session.user.id;
    // fetch lesson plans for this student
    const plans = await LessonPlan.findAll({
      where: { studentId },
      include: [{ model: User, as: 'Instructor' }]
    });

    res.render('student-plans', {
      title: 'My Lesson Plans',
      plans
    });
  } catch (error) {
    console.error('Error fetching lesson plans:', error);
    res.status(500).send('Unable to fetch lesson plans.');
  }
});

// STUDENT SINGLE CONVERSATION
app.get('/student/conversations/:instructorId', requireLogin, requireStudent, async (req, res) => {
  const studentId = req.session.user.id;
  const instructorId = parseInt(req.params.instructorId, 10);

  const messages = await Message.findAll({
    where: {
      [Op.or]: [
        { senderId: studentId, recipientId: instructorId },
        { senderId: instructorId, recipientId: studentId }
      ]
    },
    order: [['createdAt','ASC']],
    include: [
      { model: User, as: 'Sender', attributes: ['id','name','role'] },
      { model: User, as: 'Recipient', attributes: ['id','name','role'] }
    ]
  });

  const hasInstructorReply = messages.some(m => m.Sender.role === 'instructor');
  res.render('student-single-conversation', {
    title: 'Conversation with Instructor',
    instructorId,
    messages,
    hasInstructorReply
  });
});

// STUDENT MESSAGING
app.get('/student/conversations', requireLogin, requireStudent, async (req, res) => {
  const studentId = req.session.user.id;

  const sent = await Message.findAll({
    where: { senderId: studentId },
    include: [{ model: User, as: 'Recipient', attributes: ['id','name','role'] }]
  });
  const received = await Message.findAll({
    where: { recipientId: studentId },
    include: [{ model: User, as: 'Sender', attributes: ['id','name','role'] }]
  });

  const instructorsSet = new Map();
  for (let msg of sent) {
    if (msg.Recipient.role === 'instructor') {
      instructorsSet.set(msg.Recipient.id, msg.Recipient.name);
    }
  }
  for (let msg of received) {
    if (msg.Sender.role === 'instructor') {
      instructorsSet.set(msg.Sender.id, msg.Sender.name);
    }
  }
  const distinctInstructors = [...instructorsSet.entries()].map(([id, name]) => ({ id, name }));

  res.render('student-conversations', {
    title: 'My Conversations',
    distinctInstructors
  });
});

app.post('/student/request-instructor/:id', requireLogin, requireStudent, async (req, res) => {
  const instructorId = parseInt(req.params.id, 10);
  const studentId = req.session.user.id;
  const { message } = req.body;

  const instructor = await User.findOne({ where: { id: instructorId, role: 'instructor', active:true } });
  if (!instructor) return res.status(404).send('Instructor not found or inactive.');

  const existing = await InstructorStudent.findOne({ where: { instructorId, studentId } });
  if (existing) {
    return res.status(400).send(`You already have a relationship with this instructor: ${existing.status}`);
  }

  await InstructorStudent.create({
    instructorId,
    studentId,
    status: 'pending',
    message: message || null
  });

  await sendNotification(instructorId, `New roster request from student #${studentId}`);
  res.redirect('/student');
});

// Student lessons as JSON for FullCalendar
app.get('/api/student/lessons', requireLogin, requireStudent, async (req, res) => {
  const studentId = req.session.user.id;
  const lessons = await Lesson.findAll({
    where: { studentId }
  });

  const events = lessons.map(lesson => ({
    id: lesson.id,
    title: `Lesson w/ Instructor #${lesson.instructorId}`,
    start: lesson.date.toISOString(),
    end: lesson.endDate ? lesson.endDate.toISOString() : lesson.date.toISOString()
  }));

  res.json(events);
});

// Render a student calendar page
app.get('/student/calendar', requireLogin, requireStudent, (req, res) => {
  res.render('student-calendar', { title: 'Student Calendar' });
});

/***************************************************
 * 6) AUTH & LOGIN
 ***************************************************/
app.get('/login', (req, res) => {
  res.render('login', { title: 'Login' });
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ where: { email } });
    if (!user || !user.active) {
      return res.status(401).send('Invalid credentials or account blocked. <a href="/login">Try again</a>');
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).send('Invalid credentials. <a href="/login">Try again</a>');
    }

    req.session.user = {
      id: user.id,
      name: user.name,
      role: user.role
    };

    if (user.role === 'admin') {
      res.redirect('/admin');
    } else if (user.role === 'instructor') {
      res.redirect('/instructor');
    } else if (user.role === 'student') {
      res.redirect('/student');
    } else {
      res.redirect('/');
    }
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).send('An error occurred during login. Please try again.');
  }
});

app.get('/register', (req, res) => {
  res.render('register', { title: 'Register' });
});

app.post('/register', async (req, res) => {
  const { name, email, password, role } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    await User.create({ name, email, password: hashedPassword, role: role || 'student' });
    res.redirect('/');
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).send('An error occurred. Please try again.');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) console.error('Error destroying session:', err);
    res.redirect('/');
  });
});

/***************************************************
 * 7) TEST LOGINS
 ***************************************************/
app.get('/test-login/admin', async (req, res) => {
  try {
    const adminUser = await User.findOne({ where: { email: 'admin@example.com', role: 'admin' } });
    if (!adminUser || !adminUser.active) {
      return res.status(500).send('Test admin not found or blocked.');
    }
    req.session.user = {
      id: adminUser.id,
      name: adminUser.name,
      role: adminUser.role
    };
    res.redirect('/admin');
  } catch (error) {
    console.error('Error test logging in as admin:', error);
    res.status(500).send('Error occurred during test login.');
  }
});

app.get('/test-login/instructor', async (req, res) => {
  try {
    const testInstructor = await User.findOne({ where: { email: 'test_instructor@example.com', role: 'instructor' } });
    if (!testInstructor || !testInstructor.active) {
      return res.status(500).send('Test instructor not found or blocked.');
    }
    req.session.user = {
      id: testInstructor.id,
      name: testInstructor.name,
      role: testInstructor.role
    };
    res.redirect('/instructor');
  } catch (error) {
    console.error('Error test logging in as instructor:', error);
    res.status(500).send('Error occurred during test login.');
  }
});

app.get('/test-login/student', async (req, res) => {
  try {
    const testStudent = await User.findOne({ where: { email: 'test_student@example.com', role: 'student' } });
    if (!testStudent || !testStudent.active) {
      return res.status(500).send('Test student not found or blocked.');
    }
    req.session.user = {
      id: testStudent.id,
      name: testStudent.name,
      role: testStudent.role
    };
    res.redirect('/student');
  } catch (error) {
    console.error('Error test logging in as student:', error);
    res.status(500).send('Error occurred during test login.');
  }
});

/***************************************************
 * 8) SYNC DB & START SERVER
 ***************************************************/
const http = require('http');
const { Server } = require('socket.io');

sequelize.sync({ force: true })
  .then(async () => {
    console.log('Database synced!');
    
    // 1) Hash the password once
    const hashedPassword = await bcrypt.hash('password', 10);

    // 2) Create Admin
    await User.create({
      name: 'Admin User',
      email: 'admin@example.com',
      password: hashedPassword,
      role: 'admin',
      active: true
    });

    // 3) Create Test Instructor
    await User.create({
      name: 'Test Instructor',
      email: 'test_instructor@example.com',
      password: hashedPassword,
      role: 'instructor',
      active: true
    });

    // 4) Create Test Student
    await User.create({
      name: 'Test Student',
      email: 'test_student@example.com',
      password: hashedPassword,
      role: 'student',
      active: true
    });

    // OPTIONAL: Seed some Competencies
    // e.g. 'Parallel Parking', 'Roundabouts', 'Reversing'
    const parallelParking = await Competency.create({ name: 'Parallel Parking' });
    const roundabouts = await Competency.create({ name: 'Roundabouts' });
    const reversing = await Competency.create({ name: 'Reversing' });
    // Now the instructor can assign them to a student with status in StudentCompetency

    // 5) Then create the server & Socket.io
    const server = http.createServer(app);
    const io = new Server(server);

    server.listen(3000, () => {
      console.log('Server running on http://localhost:3000');
      console.log('Admin: admin@example.com / password');
      console.log('Test Instructor: test_instructor@example.com / password');
      console.log('Test Student: test_student@example.com / password');
    });

    io.on('connection', (socket) => {
      console.log('A client connected:', socket.id);
      socket.on('disconnect', () => {
        console.log('A client disconnected:', socket.id);
      });
    });

    app.locals.io = io;
  })
  .catch(err => {
    console.error('Unable to sync database:', err);
  });

// Test route to send a quick notification
app.get('/test-notification', async (req, res) => {
  try {
    // Suppose we want to notify user #1
    const testUserId = 1;
    await sendNotification(testUserId, 'Hello from the test route!');
    res.send('Notification sent to user #1!');
  } catch (error) {
    console.error('Error in test notification route:', error);
    res.status(500).send('Error sending test notification.');
  }
});
