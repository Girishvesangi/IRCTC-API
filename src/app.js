const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();
const app = express();

app.use(cors());
app.use(express.json());

// Middleware
const authenticateToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Token required' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Invalid token' });
    req.user = user;
    next();
  });
};

const isAdmin = (req, res, next) => {
  if (req.headers['x-api-key'] !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ message: 'Invalid API key' });
  }
  next();
};

// Auth routes
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        username,
        password: hashedPassword
      }
    });

    res.status(201).json({ message: 'User registered' });
  } catch (error) {
    res.status(400).json({ message: 'Registration failed' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await prisma.user.findUnique({ where: { username } });

    if (!user || !await bcrypt.compare(password, user.password)) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, isAdmin: user.isAdmin }, process.env.JWT_SECRET);
    res.json({ token });
  } catch (error) {
    res.status(500).json({ message: 'Login failed' });
  }
});

// Train routes
app.post('/api/trains', isAdmin, async (req, res) => {
  try {
    const { name, source, destination, totalSeats } = req.body;
    const train = await prisma.train.create({
      data: {
        name,
        source,
        destination,
        totalSeats,
        availableSeats: totalSeats
      }
    });
    res.status(201).json(train);
  } catch (error) {
    res.status(500).json({ message: 'Failed to add train' });
  }
});

app.get('/api/trains/availability', async (req, res) => {
  try {
    const { source, destination } = req.query;
    const trains = await prisma.train.findMany({
      where: {
        source,
        destination,
        availableSeats: { gt: 0 }
      },
      select: {
        id: true,
        name: true,
        availableSeats: true
      }
    });
    res.json(trains);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch trains' });
  }
});

// Booking routes with concurrent booking handling
app.post('/api/bookings', authenticateToken, async (req, res) => {
  const { trainId } = req.body;
  const userId = req.user.id;

  try {
    
    const booking = await prisma.$transaction(async (prisma) => {
      
      const train = await prisma.train.findUnique({
        where: { id: trainId }
      });

      if (!train || train.availableSeats <= 0) {
        throw new Error('No seats available');
      }

     
      const seatNumber = train.totalSeats - train.availableSeats + 1;
      
      const updatedTrain = await prisma.train.update({
        where: {
          id: trainId,
          availableSeats: { gt: 0 },
          version: train.version // Optimistic locking
        },
        data: {
          availableSeats: { decrement: 1 },
          version: { increment: 1 }
        }
      });

      if (!updatedTrain) {
        throw new Error('Booking failed - concurrent update detected');
      }

      return prisma.booking.create({
        data: {
          userId,
          trainId,
          seatNumber
        }
      });
    });

    res.status(201).json(booking);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.get('/api/bookings/:id', authenticateToken, async (req, res) => {
  try {
    const booking = await prisma.booking.findUnique({
      where: {
        id: parseInt(req.params.id),
        userId: req.user.id
      },
      include: {
        train: {
          select: {
            name: true,
            source: true,
            destination: true
          }
        }
      }
    });

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    res.json(booking);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch booking' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
