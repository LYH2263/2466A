import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import jwt from 'jsonwebtoken';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const MAX_CATEGORIES = 10;

const PRESET_COLORS = [
  '#67c23a', '#e6a23c', '#409eff', '#f56c6c', '#909399',
  '#8e44ad', '#16a085', '#d35400', '#2980b9', '#c0392b',
  '#27ae60', '#f39c12', '#34495e', '#1abc9c', '#e74c3c'
];

function authMiddleware(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未提供访问令牌' });
  }

  const token = authHeader.substring(7);
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    req.userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(401).json({ error: '访问令牌无效或已过期' });
  }
}

const createCategorySchema = z.object({
  name: z.string().min(1, '类别名称不能为空').max(50, '类别名称最多50字'),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, '颜色格式必须为 #RRGGBB')
});

const updateCategorySchema = z.object({
  name: z.string().min(1, '类别名称不能为空').max(50, '类别名称最多50字').optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, '颜色格式必须为 #RRGGBB').optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional()
});

const reorderSchema = z.object({
  orders: z.array(z.object({
    id: z.string(),
    sortOrder: z.number().int().min(0)
  }))
});

function generateColor(existingColors: string[]): string {
  const usedColors = new Set(existingColors.map(c => c.toLowerCase()));
  for (const color of PRESET_COLORS) {
    if (!usedColors.has(color.toLowerCase())) {
      return color;
    }
  }
  let randomColor: string;
  do {
    randomColor = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
  } while (usedColors.has(randomColor.toLowerCase()));
  return randomColor;
}

router.get('/', authMiddleware, async (req: any, res) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    
    const where: any = {
      userId: req.userId,
      deletedAt: null
    };
    
    if (!includeInactive) {
      where.isActive = true;
    }

    const categories = await prisma.category.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
    });

    res.json({ categories });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: '获取类别列表失败' });
  }
});

router.post('/', authMiddleware, async (req: any, res) => {
  try {
    const data = createCategorySchema.parse(req.body);

    const existingCount = await prisma.category.count({
      where: { userId: req.userId, deletedAt: null }
    });

    if (existingCount >= MAX_CATEGORIES) {
      return res.status(400).json({ error: `类别数量不能超过 ${MAX_CATEGORIES} 个` });
    }

    const existingByName = await prisma.category.findFirst({
      where: {
        userId: req.userId,
        name: data.name,
        deletedAt: null
      }
    });

    if (existingByName) {
      return res.status(400).json({ error: '类别名称已存在' });
    }

    const existingColors = await prisma.category.findMany({
      where: { userId: req.userId, deletedAt: null },
      select: { color: true }
    }).then(cats => cats.map(c => c.color));

    if (existingColors.some(c => c.toLowerCase() === data.color.toLowerCase())) {
      return res.status(400).json({ error: '颜色已被使用，请选择其他颜色' });
    }

    const maxSortOrder = await prisma.category.findMany({
      where: { userId: req.userId, deletedAt: null },
      select: { sortOrder: true },
      orderBy: { sortOrder: 'desc' },
      take: 1
    }).then(cats => cats.length > 0 ? cats[0].sortOrder : -1);

    const category = await prisma.category.create({
      data: {
        userId: req.userId,
        name: data.name,
        color: data.color,
        sortOrder: maxSortOrder + 1,
        isActive: true,
        isDefault: false
      }
    });

    res.status(201).json({ category, message: '类别创建成功' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Create category error:', error);
    res.status(500).json({ error: '创建类别失败' });
  }
});

router.put('/:id', authMiddleware, async (req: any, res) => {
  try {
    const { id } = req.params;
    const data = updateCategorySchema.parse(req.body);

    const category = await prisma.category.findFirst({
      where: { id, userId: req.userId, deletedAt: null }
    });

    if (!category) {
      return res.status(404).json({ error: '类别不存在或无权限' });
    }

    if (data.name && data.name !== category.name) {
      const existingByName = await prisma.category.findFirst({
        where: {
          userId: req.userId,
          name: data.name,
          deletedAt: null,
          NOT: { id }
        }
      });

      if (existingByName) {
        return res.status(400).json({ error: '类别名称已存在' });
      }
    }

    if (data.color && data.color.toLowerCase() !== category.color.toLowerCase()) {
      const existingColors = await prisma.category.findMany({
        where: { userId: req.userId, deletedAt: null, NOT: { id } },
        select: { color: true }
      }).then(cats => cats.map(c => c.color));

      if (existingColors.some(c => c.toLowerCase() === data.color!.toLowerCase())) {
        return res.status(400).json({ error: '颜色已被使用，请选择其他颜色' });
      }
    }

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.color !== undefined) updateData.color = data.color;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder;

    const updatedCategory = await prisma.category.update({
      where: { id },
      data: updateData
    });

    res.json({ category: updatedCategory, message: '类别更新成功' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Update category error:', error);
    res.status(500).json({ error: '更新类别失败' });
  }
});

router.patch('/reorder', authMiddleware, async (req: any, res) => {
  try {
    const { orders } = reorderSchema.parse(req.body);

    const userCategories = await prisma.category.findMany({
      where: { userId: req.userId, deletedAt: null },
      select: { id: true }
    }).then(cats => new Set(cats.map(c => c.id)));

    for (const order of orders) {
      if (!userCategories.has(order.id)) {
        return res.status(404).json({ error: `类别 ${order.id} 不存在或无权限` });
      }
    }

    const updates = orders.map(order =>
      prisma.category.update({
        where: { id: order.id },
        data: { sortOrder: order.sortOrder }
      })
    );

    await prisma.$transaction(updates);

    res.json({ message: '排序更新成功' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Reorder categories error:', error);
    res.status(500).json({ error: '更新排序失败' });
  }
});

router.delete('/:id', authMiddleware, async (req: any, res) => {
  try {
    const { id } = req.params;

    const category = await prisma.category.findFirst({
      where: { id, userId: req.userId, deletedAt: null }
    });

    if (!category) {
      return res.status(404).json({ error: '类别不存在或无权限' });
    }

    if (category.isDefault) {
      return res.status(400).json({ error: '默认类别不能删除' });
    }

    const hasItems = await prisma.assetItem.findFirst({
      where: { categoryId: id }
    });

    if (hasItems) {
      return res.status(400).json({
        error: '该类别下存在历史数据，无法删除。如需删除请先停用该类别。',
        code: 'HAS_HISTORY_DATA'
      });
    }

    await prisma.category.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false
      }
    });

    res.json({ message: '类别删除成功' });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({ error: '删除类别失败' });
  }
});

router.get('/preset-colors', authMiddleware, async (req: any, res) => {
  try {
    const usedColors = await prisma.category.findMany({
      where: { userId: req.userId, deletedAt: null },
      select: { color: true }
    }).then(cats => cats.map(c => c.color.toLowerCase()));

    const availableColors = PRESET_COLORS.filter(c => !usedColors.includes(c.toLowerCase()));
    
    res.json({
      presetColors: PRESET_COLORS,
      usedColors,
      availableColors,
      nextSuggestedColor: availableColors[0] || generateColor(usedColors)
    });
  } catch (error) {
    console.error('Get preset colors error:', error);
    res.status(500).json({ error: '获取预设颜色失败' });
  }
});

export default router;
