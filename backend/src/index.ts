import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import authRoutes from './routes/auth.js';
import assetRoutes from './routes/assets.js';
import categoryRoutes from './routes/categories.js';

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 8000;

// Trust proxy (behind nginx)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3010',
    'http://localhost:5173'
  ],
  credentials: true
}));
app.use(cookieParser());
app.use(express.json());

// Rate limiting
const loginLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 5,
  message: { error: '请求过于频繁，请稍后再试' }
});

const refreshLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 20,
  message: { error: '请求过于频繁，请稍后再试' }
});

// Apply rate limiting to specific routes
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/refresh', refreshLimiter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/categories', categoryRoutes);

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ error: '服务器内部错误' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: '接口不存在' });
});

const DEFAULT_CATEGORIES = [
  { name: '活钱', color: '#67c23a', sortOrder: 0 },
  { name: '长期投资', color: '#e6a23c', sortOrder: 1 },
  { name: '稳定债券', color: '#409eff', sortOrder: 2 }
];

async function createDefaultCategoriesForUser(userId: string) {
  for (const cat of DEFAULT_CATEGORIES) {
    await prisma.category.create({
      data: {
        userId,
        name: cat.name,
        color: cat.color,
        sortOrder: cat.sortOrder,
        isDefault: true,
        isActive: true
      }
    });
  }
}

async function autoSeed() {
  try {
    const existingAdmin = await prisma.user.findUnique({
      where: { email: 'admin@example.com' }
    });

    if (!existingAdmin) {
      const passwordHash = await bcrypt.hash('admin123', 12);
      const user = await prisma.user.create({
        data: {
          email: 'admin@example.com',
          passwordHash,
          role: 'admin'
        }
      });
      await createDefaultCategoriesForUser(user.id);
      console.log('Default admin user created with categories');
    } else {
      const existingCategories = await prisma.category.findMany({
        where: { userId: existingAdmin.id, deletedAt: null }
      });
      if (existingCategories.length === 0) {
        await createDefaultCategoriesForUser(existingAdmin.id);
        console.log('Default categories created for existing admin');
      }
    }
  } catch (error) {
    console.error('Auto-seed error:', error);
  }
}

app.listen(PORT, async () => {
  console.log(`Backend server running on port ${PORT}`);
  await autoSeed();
});

export { prisma };
