/***************************************************
 * FILE: server.js
 ***************************************************/
const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const app = express();
const sequelize = require('./db');

const { Op, fn, col } = require('sequelize');
const bcrypt = require('bcrypt');
const session = require('express-session');
const http = require('http');
const { Server } = require('socket.io');
const cron = require('node-cron');
const nodemailer = require('nodemailer');

// Models
const User = require('./models/User');
const Lesson = require('./models/Lesson');
const Payment = require('./models/Payment');
const Review = require('./models/Review');
const Message = require('./models/Message');
const StudentReview = require('./models/StudentReview');
const Notification = require('./models/Notification');
const InstructorStudent = require('./models/InstructorStudent');
const LessonPlan = require('./models/LessonPlan');
const Competency = require('./models/Competency');
const StudentCompetency = require('./models/StudentCompetency');

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
// 1) Email transport - In production, configure properly
const transporter = nodemailer.createTransport({
  host: 'smtp.example.com',
  port: 587,
  auth: {
    user: 'USERNAME',
    pass: 'PASSWORD'
  }
});

// 2) Send an email
async function sendEmail(to, subject, text) {
  // In production, handle errors & HTML
  const mailOptions = {
    from: 'no-reply@yourdrivingapp.com',
    to,
    subject,
    text
  };
  await transporter.sendMail(mailOptions);
  console.log(`(Email sent) to: ${to}, subject: ${subject}`);
}

// Real-time notifications
async function sendNotification(userId, message) {
  await Notification.create({ userId, message });
  const io = app.locals.io;
  if (io) {
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

// Success/Failure messages
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
    const student = await User.findOne({ where: { id: studentId, role: 'student' } });
    if (!student) return res.status(404).send('Student not found');

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

    res.redirect('/instructor');
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
  res.send('Accepted roster request (placeholder)');
});

app.post('/instructor/roster/:id/decline', requireLogin, requireInstructor, async (req, res) => {
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

// Example: POST /instructor/lessons/:id/complete
app.post('/instructor/lessons/:id/complete', requireLogin, requireInstructor, async (req, res) => {
  const lessonId = parseInt(req.params.id, 10);
  const instructorId = req.session.user.id;
  const { notes } = req.body;

  try {
    const lesson = await Lesson.findOne({ 
      where: { id: lessonId, instructorId, status: 'upcoming' }
    });
    if (!lesson) {
      return res.status(404).send('Lesson not found, not upcoming, or does not belong to you.');
    }

    // Mark lesson as completed
    lesson.status = 'completed';
    lesson.notes = notes;
    await lesson.save();

    // Award XP to the student
    const student = await User.findByPk(lesson.studentId);
    if (student) {
      // For example, +25 XP for each completed lesson
      const oldXP = student.xp || 0;   // fallback if not defined
      const oldLevel = student.level || 1;

      const newXP = oldXP + 25;
      student.xp = newXP;

      // level = floor(xp/100) + 1
      const newLevel = Math.floor(newXP / 100) + 1;
      student.level = newLevel;

      await student.save();

      // If the student's level changed, you could send a notification
      if (newLevel > oldLevel) {
        console.log(`Student #${student.id} leveled up to Level ${newLevel}!`);
        // or sendNotification(student.id, `Congrats! You've reached level ${newLevel}!`);
      }
    }

    res.redirect('/instructor');
  } catch (error) {
    console.error('Error completing lesson:', error);
    res.status(500).send('An error occurred. Please try again.');
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

// STUDENT DASHBOARD (WITH ACHIEVEMENTS)
app.get('/student', requireLogin, requireStudent, async (req, res) => {
  try {
    const studentId = req.session.user.id;

    // Fetch the student record from DB
    const studentRecord = await User.findByPk(studentId);
    if (!studentRecord) {
      return res.status(404).send('Student not found.');
    }

    // 1) upcoming & completed
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

    // 2) instructors for messaging
    const instructorIds = new Set();
    upcomingLessons.forEach(l => instructorIds.add(l.instructorId));
    completedLessons.forEach(l => instructorIds.add(l.instructorId));
    const instructorsForMessaging = await User.findAll({
      where: { id: Array.from(instructorIds) }
    });

    // 3) reviews
    const writtenReviews = await Review.findAll({ where: { studentId } });
    const reviewedInstructorIds = new Set(writtenReviews.map(r => r.instructorId));

    // 4) achievements
    let achievements = [];
    if (completedLessons.length >= 1) {
      achievements.push({
        name: 'First Lesson Completed',
        description: 'You have completed your very first lesson! Great job!'
      });
    }
    if (completedLessons.length >= 5) {
      achievements.push({
        name: '5 Lessons Completed',
        description: 'You’ve completed 5 lessons and are on your way to success!'
      });
    }

    res.render('student', {
      title: 'Student Dashboard',
      student: studentRecord,  // pass the full student object
      upcomingLessons,
      completedLessons,
      reviewedInstructorIds,
      instructorsForMessaging,
      achievements
    });
  } catch (error) {
    console.error('Error fetching student data:', error);
    res.status(500).send('Unable to fetch lessons.');
  }
});

// STUDENT PROGRESS
app.get('/student/progress', requireLogin, requireStudent, async (req, res) => {
  const studentId = req.session.user.id;
  const records = await StudentCompetency.findAll({
    where: { studentId },
    include: [{ model: Competency }]
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
sequelize.sync({ force: true })
  .then(async () => {
    console.log('Database synced!');

    const hashedPassword = await bcrypt.hash('password', 10);

    await User.create({
      name: 'Admin User',
      email: 'admin@example.com',
      password: hashedPassword,
      role: 'admin',
      active: true
    });
    await User.create({
      name: 'Test Instructor',
      email: 'test_instructor@example.com',
      password: hashedPassword,
      role: 'instructor',
      active: true
    });
    await User.create({
      name: 'Test Student',
      email: 'test_student@example.com',
      password: hashedPassword,
      role: 'student',
      active: true
    });

    // Seed some Competencies
    const parallelParking = await Competency.create({ name: 'Parallel Parking' });
    const roundabouts = await Competency.create({ name: 'Roundabouts' });
    const reversing = await Competency.create({ name: 'Reversing' });

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
    const testUserId = 1;
    await sendNotification(testUserId, 'Hello from the test route!');
    res.send('Notification sent to user #1!');
  } catch (error) {
    console.error('Error in test notification route:', error);
    res.status(500).send('Error sending test notification.');
  }
});

/***************************************************
 * 9) REMINDER JOB: CRON + Nodemailer + Enhancements
 ***************************************************/
// 1) route for student to set reminder preferences
app.get('/student/profile', requireLogin, requireStudent, async (req, res) => {
  const student = await User.findByPk(req.session.user.id);
  if (!student) return res.status(404).send('Student not found.');

  res.render('student-profile', {
    title: 'My Profile',
    student
  });
});

app.post('/student/profile', requireLogin, requireStudent, async (req, res) => {
  const { reminderHours, remindersOptOut, locale } = req.body;
  const student = await User.findByPk(req.session.user.id);
  if (!student) return res.status(404).send('Student not found.');

  const optOut = (remindersOptOut === 'on');
  const hours = parseInt(reminderHours, 10) || 24;

  student.reminderHours = hours;
  student.remindersOptOut = optOut;
  student.locale = locale || 'en-GB';

  await student.save();
  req.session.successMessage = 'Profile updated!';
  res.redirect('/student/profile');
});

// 2) Cron job: run every hour => "0 * * * *"
cron.schedule('0 * * * *', async () => {
  console.log('Running hourly reminder job...');

  try {
    const now = new Date();

    // Find all upcoming lessons with date>now
    const allUpcoming = await Lesson.findAll({
      where: {
        status: 'upcoming',
        date: { [Op.gt]: now }
      },
      include: [
        { model: User, as: 'Student' },
        { model: User, as: 'Instructor' }
      ]
    });

    for (const lesson of allUpcoming) {
      const student = lesson.Student;
      const instructor = lesson.Instructor;
      if (!student || !instructor) continue;

      if (student.remindersOptOut) {
        continue;
      }

      const reminderWindow = student.reminderHours || 24;
      const lessonTime = lesson.date;
      const diffMs = lessonTime - now;
      const diffHours = diffMs / (1000 * 60 * 60);

      if (diffHours > 0 && diffHours <= reminderWindow) {
        const userLocale = student.locale || 'en-GB';
        const dateFormatter = new Intl.DateTimeFormat(userLocale, {
          dateStyle: 'medium',
          timeStyle: 'short'
        });
        const localLessonTime = dateFormatter.format(lessonTime);

        // Send reminder to student
        const studentSubject = 'Lesson Reminder';
        const studentText = `Hello ${student.name},
This is a reminder that you have a lesson on ${localLessonTime} with Instructor #${lesson.instructorId}.
Please be prepared and arrive on time.`;

        await sendEmail(student.email, studentSubject, studentText);

        // Also to instructor if needed
        const instructorSubject = 'Upcoming Lesson Reminder';
        const instructorText = `Hello ${instructor.name},
You have an upcoming lesson on ${localLessonTime} with Student #${student.id}.
Please be prepared.`;

        await sendEmail(instructor.email, instructorSubject, instructorText);

        console.log(`Reminder sent for lesson #${lesson.id}, student #${student.id}, instructor #${instructor.id}`);
      }
    }
  } catch (error) {
    console.error('Error in reminder job:', error);
  }
});
