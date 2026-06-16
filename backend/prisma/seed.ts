import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

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

async function main() {
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
    
    console.log('Admin user created: admin@example.com / admin123');
    console.log('Default categories created for admin user');
  } else {
    const existingCategories = await prisma.category.findMany({
      where: { userId: existingAdmin.id, deletedAt: null }
    });

    if (existingCategories.length === 0) {
      await createDefaultCategoriesForUser(existingAdmin.id);
      console.log('Default categories created for existing admin user');
    } else {
      console.log('Admin user already exists with categories');
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
