import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import jwt from 'jsonwebtoken';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const MAX_TAGS_PER_RECORD = 5;
const MAX_TAGS_PER_USER = 20;

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

const createTagSchema = z.object({
  name: z.string().min(1, '标签名称不能为空').max(30, '标签名称最多30字'),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, '颜色格式必须为 #RRGGBB').optional()
});

const updateTagSchema = z.object({
  name: z.string().min(1, '标签名称不能为空').max(30, '标签名称最多30字').optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, '颜色格式必须为 #RRGGBB').optional()
});

const deleteTagSchema = z.object({
  cascadeRecords: z.boolean().optional().default(false)
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
    const tags = await prisma.tag.findMany({
      where: { userId: req.userId },
      orderBy: [{ createdAt: 'asc' }]
    });

    const tagsWithUsage = await Promise.all(
      tags.map(async (tag) => {
        const recordCount = await prisma.assetRecordTag.count({
          where: { tagId: tag.id }
        });
        return {
          ...tag,
          recordCount
        };
      })
    );

    res.json({ tags: tagsWithUsage });
  } catch (error) {
    console.error('Get tags error:', error);
    res.status(500).json({ error: '获取标签列表失败' });
  }
});

router.post('/', authMiddleware, async (req: any, res) => {
  try {
    const data = createTagSchema.parse(req.body);

    const existingCount = await prisma.tag.count({
      where: { userId: req.userId }
    });

    if (existingCount >= MAX_TAGS_PER_USER) {
      return res.status(400).json({ error: `标签数量不能超过 ${MAX_TAGS_PER_USER} 个` });
    }

    const existingByName = await prisma.tag.findFirst({
      where: {
        userId: req.userId,
        name: data.name.trim()
      }
    });

    if (existingByName) {
      return res.status(400).json({ error: '标签名称已存在' });
    }

    const existingColors = await prisma.tag.findMany({
      where: { userId: req.userId },
      select: { color: true }
    }).then(tags => tags.map(t => t.color));

    const color = data.color || generateColor(existingColors);

    const tag = await prisma.tag.create({
      data: {
        userId: req.userId,
        name: data.name.trim(),
        color
      }
    });

    res.status(201).json({ tag, message: '标签创建成功' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Create tag error:', error);
    res.status(500).json({ error: '创建标签失败' });
  }
});

router.put('/:id', authMiddleware, async (req: any, res) => {
  try {
    const { id } = req.params;
    const data = updateTagSchema.parse(req.body);

    const tag = await prisma.tag.findFirst({
      where: { id, userId: req.userId }
    });

    if (!tag) {
      return res.status(404).json({ error: '标签不存在或无权限' });
    }

    if (data.name && data.name.trim() !== tag.name) {
      const existingByName = await prisma.tag.findFirst({
        where: {
          userId: req.userId,
          name: data.name.trim(),
          NOT: { id }
        }
      });

      if (existingByName) {
        return res.status(400).json({ error: '标签名称已存在' });
      }
    }

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name.trim();
    if (data.color !== undefined) updateData.color = data.color;

    const updatedTag = await prisma.tag.update({
      where: { id },
      data: updateData
    });

    res.json({ tag: updatedTag, message: '标签更新成功' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Update tag error:', error);
    res.status(500).json({ error: '更新标签失败' });
  }
});

router.delete('/:id', authMiddleware, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { cascadeRecords } = deleteTagSchema.parse(req.query);

    const tag = await prisma.tag.findFirst({
      where: { id, userId: req.userId }
    });

    if (!tag) {
      return res.status(404).json({ error: '标签不存在或无权限' });
    }

    const referencedCount = await prisma.assetRecordTag.count({
      where: { tagId: id }
    });

    if (referencedCount > 0 && !cascadeRecords) {
      return res.status(400).json({
        error: `该标签被 ${referencedCount} 条记录引用，删除将同时移除这些记录上的标签关联。`,
        code: 'TAG_IN_USE',
        referencedCount
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.assetRecordTag.deleteMany({
        where: { tagId: id }
      });

      await tx.tag.delete({
        where: { id }
      });
    });

    res.json({ message: '标签删除成功' });
  } catch (error) {
    console.error('Delete tag error:', error);
    res.status(500).json({ error: '删除标签失败' });
  }
});

router.get('/statistics', authMiddleware, async (req: any, res) => {
  try {
    const tags = await prisma.tag.findMany({
      where: { userId: req.userId },
      orderBy: [{ createdAt: 'asc' }]
    });

    const tagStats = await Promise.all(
      tags.map(async (tag) => {
        const recordTags = await prisma.assetRecordTag.findMany({
          where: { tagId: tag.id },
          include: {
            assetRecord: {
              select: { total: true, date: true }
            }
          }
        });

        const recordCount = recordTags.length;
        let totalAssetSum = 0;
        let latestTotal = 0;
        let latestDate: Date | null = null;

        for (const rt of recordTags) {
          const total = Number(rt.assetRecord.total);
          totalAssetSum += total;
          
          if (!latestDate || rt.assetRecord.date > latestDate) {
            latestDate = rt.assetRecord.date;
            latestTotal = total;
          }
        }

        const avgAsset = recordCount > 0 ? totalAssetSum / recordCount : 0;

        return {
          tagId: tag.id,
          tagName: tag.name,
          tagColor: tag.color,
          recordCount,
          totalAssetSum,
          avgAsset,
          latestTotal,
          latestDate: latestDate ? latestDate.toISOString().split('T')[0] : null
        };
      })
    );

    const totalRecords = await prisma.assetRecord.count({
      where: { userId: req.userId }
    });

    const taggedRecords = await prisma.assetRecordTag.findMany({
      where: { assetRecord: { userId: req.userId } },
      select: { assetRecordId: true },
      distinct: ['assetRecordId']
    }).then(rt => rt.length);

    const untaggedCount = totalRecords - taggedRecords;

    res.json({
      tagStats,
      totalRecords,
      taggedRecords,
      untaggedCount
    });
  } catch (error) {
    console.error('Tag statistics error:', error);
    res.status(500).json({ error: '获取标签统计失败' });
  }
});

router.get('/preset-colors', authMiddleware, async (req: any, res) => {
  try {
    const usedColors = await prisma.tag.findMany({
      where: { userId: req.userId },
      select: { color: true }
    }).then(tags => tags.map(t => t.color.toLowerCase()));

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

export { router as tagRoutes, MAX_TAGS_PER_RECORD };
