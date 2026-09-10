-- wechat template cloud library
-- - create public.wechat_templates
-- - enable rls with public read
-- - seed diversified wechat templates

create table if not exists public.wechat_templates (
  id text primary key,
  name text not null,
  thumbnail text not null,
  categories text[] not null default '{}',
  color_family text not null check (color_family in ('red','orange','yellow','green','blue','purple','pink','gray','black','white')),
  has_hero_image boolean not null default false,
  color_scheme jsonb not null,
  block_styles jsonb not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wechat_templates_active_sort_idx
  on public.wechat_templates (is_active, sort_order, created_at);

alter table public.wechat_templates enable row level security;

drop policy if exists "wechat_templates_read_anon" on public.wechat_templates;
create policy "wechat_templates_read_anon"
  on public.wechat_templates
  for select
  to anon
  using (is_active = true);

drop policy if exists "wechat_templates_read_authenticated" on public.wechat_templates;
create policy "wechat_templates_read_authenticated"
  on public.wechat_templates
  for select
  to authenticated
  using (is_active = true);

drop trigger if exists wechat_templates_set_updated_at on public.wechat_templates;
create trigger wechat_templates_set_updated_at
  before update on public.wechat_templates
  for each row execute function public.set_updated_at();

insert into public.wechat_templates (
  id,
  name,
  thumbnail,
  categories,
  color_family,
  has_hero_image,
  color_scheme,
  block_styles,
  sort_order,
  is_active
) values
(
  'editorial-news',
  '报刊纪实',
  'https://dummyimage.com/480x640/f3f4f6/111827&text=Editorial+News',
  array['教育', '纪实', '校园'],
  'gray',
  true,
  '{"primary":"#111827","secondary":"#4b5563","background":"#ffffff","text":"#111827","accent":"#dc2626"}'::jsonb,
  $$[
    {"id":"editorial-news-article-title","blockType":"article-title","name":"报刊主标题","previewHtml":"<section style='padding:18px 0 6px;border-bottom:2px solid {{color:primary}};'><h1 style='margin:0;font-size:30px;line-height:1.3;color:{{color:primary}};font-weight:800;letter-spacing:1px;'>{{content}}</h1></section>","templateHtml":"<section style='padding:18px 0 6px;border-bottom:2px solid {{color:primary}};'><h1 style='margin:0;font-size:30px;line-height:1.3;color:{{color:primary}};font-weight:800;letter-spacing:1px;'>{{content}}</h1></section>"},
    {"id":"editorial-news-hero-title","blockType":"hero-title","name":"导语标题","previewHtml":"<section style='padding:20px 16px;background:#f8fafc;border:1px solid #d1d5db;'><h2 style='margin:0;font-size:22px;color:{{color:primary}};'>{{content}}</h2></section>","templateHtml":"<section style='padding:20px 16px;background:#f8fafc;border:1px solid #d1d5db;'><h2 style='margin:0;font-size:22px;color:{{color:primary}};'>{{content}}</h2></section>"},
    {"id":"editorial-news-hero-subtitle","blockType":"hero-subtitle","name":"导语副标题","previewHtml":"<section style='padding:10px 16px 18px;background:#f8fafc;border:1px solid #d1d5db;border-top:none;'><p style='margin:0;color:{{color:secondary}};font-size:14px;'>{{content}}</p></section>","templateHtml":"<section style='padding:10px 16px 18px;background:#f8fafc;border:1px solid #d1d5db;border-top:none;'><p style='margin:0;color:{{color:secondary}};font-size:14px;'>{{content}}</p></section>"},
    {"id":"editorial-news-intro","blockType":"intro","name":"开篇导语","previewHtml":"<section style='margin:14px 0;padding:14px 16px;background:#f9fafb;border-left:4px solid {{color:accent}};'><p style='margin:0;font-size:16px;line-height:1.9;color:{{color:text}};'>{{content}}</p></section>","templateHtml":"<section style='margin:14px 0;padding:14px 16px;background:#f9fafb;border-left:4px solid {{color:accent}};'><p style='margin:0;font-size:16px;line-height:1.9;color:{{color:text}};'>{{content}}</p></section>"},
    {"id":"editorial-news-section-title","blockType":"section-title","name":"报刊小标题","previewHtml":"<section style='margin:20px 0 10px;'><h3 style='margin:0;font-size:20px;color:{{color:primary}};font-weight:700;'>■ {{content}}</h3></section>","templateHtml":"<section style='margin:20px 0 10px;'><h3 style='margin:0;font-size:20px;color:{{color:primary}};font-weight:700;'>■ {{content}}</h3></section>"},
    {"id":"editorial-news-section-content","blockType":"section-content","name":"报刊正文","previewHtml":"<section style='margin:10px 0;'><p style='margin:0;font-size:16px;line-height:1.9;color:{{color:text}};text-align:justify;'>{{content}}</p></section>","templateHtml":"<section style='margin:10px 0;'><p style='margin:0;font-size:16px;line-height:1.9;color:{{color:text}};text-align:justify;'>{{content}}</p></section>"},
    {"id":"editorial-news-image","blockType":"image","name":"图片与图注","previewHtml":"<section style='margin:18px 0;text-align:center;'><img src='{{imageUrl}}' alt='{{caption}}' style='max-width:100%;border-radius:6px;'/>{{captionHtml}}</section>","templateHtml":"<section style='margin:18px 0;text-align:center;'><img src='{{imageUrl}}' alt='{{caption}}' style='max-width:100%;border-radius:6px;'/>{{captionHtml}}</section>"},
    {"id":"editorial-news-divider","blockType":"divider","name":"细分割线","previewHtml":"<section style='margin:20px 0;text-align:center;'><span style='display:inline-block;width:64px;height:1px;background:{{color:secondary}};'></span></section>","templateHtml":"<section style='margin:20px 0;text-align:center;'><span style='display:inline-block;width:64px;height:1px;background:{{color:secondary}};'></span></section>"},
    {"id":"editorial-news-blockquote","blockType":"blockquote","name":"引用框","previewHtml":"<section style='margin:16px 0;padding:12px 14px;background:#f3f4f6;border-left:3px solid {{color:primary}};'><blockquote style='margin:0;color:{{color:text}};font-style:italic;'>{{content}}</blockquote></section>","templateHtml":"<section style='margin:16px 0;padding:12px 14px;background:#f3f4f6;border-left:3px solid {{color:primary}};'><blockquote style='margin:0;color:{{color:text}};font-style:italic;'>{{content}}</blockquote></section>"}
  ]$$::jsonb,
  10,
  true
),
(
  'campus-pop',
  '校园活力',
  'https://dummyimage.com/480x640/fff7ed/ea580c&text=Campus+Pop',
  array['活动', '招生', '年轻化'],
  'orange',
  true,
  '{"primary":"#ea580c","secondary":"#fb923c","background":"#fffefb","text":"#7c2d12","accent":"#f97316"}'::jsonb,
  $$[
    {"id":"campus-pop-article-title","blockType":"article-title","name":"活力主标题","previewHtml":"<section style='padding:16px 0;text-align:center;'><h1 style='margin:0;display:inline-block;padding:8px 16px;border-radius:999px;background:{{color:primary}};color:#fff;font-size:28px;line-height:1.35;'>{{content}}</h1></section>","templateHtml":"<section style='padding:16px 0;text-align:center;'><h1 style='margin:0;display:inline-block;padding:8px 16px;border-radius:999px;background:{{color:primary}};color:#fff;font-size:28px;line-height:1.35;'>{{content}}</h1></section>"},
    {"id":"campus-pop-hero-title","blockType":"hero-title","name":"海报标题","previewHtml":"<section style='padding:24px 18px;background:linear-gradient(135deg, {{color:primary}}, {{color:secondary}});border-radius:14px;'><h2 style='margin:0;font-size:24px;color:#fff;text-align:center;'>{{content}}</h2></section>","templateHtml":"<section style='padding:24px 18px;background:linear-gradient(135deg, {{color:primary}}, {{color:secondary}});border-radius:14px;'><h2 style='margin:0;font-size:24px;color:#fff;text-align:center;'>{{content}}</h2></section>"},
    {"id":"campus-pop-hero-subtitle","blockType":"hero-subtitle","name":"海报副标题","previewHtml":"<section style='margin-top:8px;text-align:center;'><p style='margin:0;color:{{color:primary}};font-size:14px;'>{{content}}</p></section>","templateHtml":"<section style='margin-top:8px;text-align:center;'><p style='margin:0;color:{{color:primary}};font-size:14px;'>{{content}}</p></section>"},
    {"id":"campus-pop-intro","blockType":"intro","name":"开场卡片","previewHtml":"<section style='margin:14px 0;padding:14px;border-radius:12px;background:#fff7ed;border:1px dashed {{color:primary}};'><p style='margin:0;font-size:16px;line-height:1.85;color:{{color:text}};'>{{content}}</p></section>","templateHtml":"<section style='margin:14px 0;padding:14px;border-radius:12px;background:#fff7ed;border:1px dashed {{color:primary}};'><p style='margin:0;font-size:16px;line-height:1.85;color:{{color:text}};'>{{content}}</p></section>"},
    {"id":"campus-pop-section-title","blockType":"section-title","name":"胶囊标题","previewHtml":"<section style='margin:20px 0 10px;'><h3 style='margin:0;display:inline-block;padding:5px 12px;border-radius:8px;background:#ffedd5;color:{{color:primary}};font-size:18px;'>{{content}}</h3></section>","templateHtml":"<section style='margin:20px 0 10px;'><h3 style='margin:0;display:inline-block;padding:5px 12px;border-radius:8px;background:#ffedd5;color:{{color:primary}};font-size:18px;'>{{content}}</h3></section>"},
    {"id":"campus-pop-section-content","blockType":"section-content","name":"活力正文","previewHtml":"<section style='margin:10px 0;'><p style='margin:0;font-size:16px;line-height:1.85;color:{{color:text}};'>{{content}}</p></section>","templateHtml":"<section style='margin:10px 0;'><p style='margin:0;font-size:16px;line-height:1.85;color:{{color:text}};'>{{content}}</p></section>"},
    {"id":"campus-pop-image","blockType":"image","name":"圆角配图","previewHtml":"<section style='margin:18px 0;text-align:center;'><img src='{{imageUrl}}' alt='{{caption}}' style='max-width:100%;border-radius:14px;box-shadow:0 8px 18px rgba(234,88,12,0.18);'/>{{captionHtml}}</section>","templateHtml":"<section style='margin:18px 0;text-align:center;'><img src='{{imageUrl}}' alt='{{caption}}' style='max-width:100%;border-radius:14px;box-shadow:0 8px 18px rgba(234,88,12,0.18);'/>{{captionHtml}}</section>"},
    {"id":"campus-pop-divider","blockType":"divider","name":"圆点分隔","previewHtml":"<section style='margin:20px 0;text-align:center;color:{{color:secondary}};font-size:12px;'>● ● ●</section>","templateHtml":"<section style='margin:20px 0;text-align:center;color:{{color:secondary}};font-size:12px;'>● ● ●</section>"},
    {"id":"campus-pop-blockquote","blockType":"blockquote","name":"强调引用","previewHtml":"<section style='margin:16px 0;padding:14px;border-radius:10px;background:#fff7ed;'><blockquote style='margin:0;color:{{color:primary}};font-weight:600;'>{{content}}</blockquote></section>","templateHtml":"<section style='margin:16px 0;padding:14px;border-radius:10px;background:#fff7ed;'><blockquote style='margin:0;color:{{color:primary}};font-weight:600;'>{{content}}</blockquote></section>"}
  ]$$::jsonb,
  20,
  true
),
(
  'tea-zen',
  '新中式雅致',
  'https://dummyimage.com/480x640/f8faf5/3f6212&text=Tea+Zen',
  array['文化', '课程', '品牌'],
  'green',
  true,
  '{"primary":"#3f6212","secondary":"#84cc16","background":"#fafaf5","text":"#365314","accent":"#a16207"}'::jsonb,
  $$[
    {"id":"tea-zen-article-title","blockType":"article-title","name":"卷轴标题","previewHtml":"<section style='padding:18px 0;text-align:center;'><h1 style='margin:0;font-size:30px;color:{{color:primary}};letter-spacing:2px;'>{{content}}</h1><p style='margin:8px 0 0;color:{{color:secondary}};'>── 公众号专栏 ──</p></section>","templateHtml":"<section style='padding:18px 0;text-align:center;'><h1 style='margin:0;font-size:30px;color:{{color:primary}};letter-spacing:2px;'>{{content}}</h1><p style='margin:8px 0 0;color:{{color:secondary}};'>── 公众号专栏 ──</p></section>"},
    {"id":"tea-zen-hero-title","blockType":"hero-title","name":"古风首屏","previewHtml":"<section style='padding:24px 16px;background:#f0fdf4;border:1px solid #d9f99d;border-radius:12px;'><h2 style='margin:0;font-size:24px;color:{{color:primary}};text-align:center;'>{{content}}</h2></section>","templateHtml":"<section style='padding:24px 16px;background:#f0fdf4;border:1px solid #d9f99d;border-radius:12px;'><h2 style='margin:0;font-size:24px;color:{{color:primary}};text-align:center;'>{{content}}</h2></section>"},
    {"id":"tea-zen-hero-subtitle","blockType":"hero-subtitle","name":"古风副标题","previewHtml":"<section style='text-align:center;margin-top:8px;'><p style='margin:0;color:{{color:secondary}};'>{{content}}</p></section>","templateHtml":"<section style='text-align:center;margin-top:8px;'><p style='margin:0;color:{{color:secondary}};'>{{content}}</p></section>"},
    {"id":"tea-zen-intro","blockType":"intro","name":"温润引言","previewHtml":"<section style='margin:14px 0;padding:14px 16px;background:#fefce8;border-radius:10px;'><p style='margin:0;color:{{color:text}};line-height:1.9;'>{{content}}</p></section>","templateHtml":"<section style='margin:14px 0;padding:14px 16px;background:#fefce8;border-radius:10px;'><p style='margin:0;color:{{color:text}};line-height:1.9;'>{{content}}</p></section>"},
    {"id":"tea-zen-section-title","blockType":"section-title","name":"竹节标题","previewHtml":"<section style='margin:20px 0 10px;padding-left:12px;border-left:5px solid {{color:primary}};'><h3 style='margin:0;color:{{color:primary}};font-size:20px;'>{{content}}</h3></section>","templateHtml":"<section style='margin:20px 0 10px;padding-left:12px;border-left:5px solid {{color:primary}};'><h3 style='margin:0;color:{{color:primary}};font-size:20px;'>{{content}}</h3></section>"},
    {"id":"tea-zen-section-content","blockType":"section-content","name":"雅致正文","previewHtml":"<section style='margin:10px 0;'><p style='margin:0;color:{{color:text}};font-size:16px;line-height:1.95;text-align:justify;'>{{content}}</p></section>","templateHtml":"<section style='margin:10px 0;'><p style='margin:0;color:{{color:text}};font-size:16px;line-height:1.95;text-align:justify;'>{{content}}</p></section>"},
    {"id":"tea-zen-image","blockType":"image","name":"宣纸配图","previewHtml":"<section style='margin:18px 0;text-align:center;padding:10px;background:#fff;border:1px solid #d9f99d;border-radius:8px;'><img src='{{imageUrl}}' alt='{{caption}}' style='max-width:100%;border-radius:4px;'/>{{captionHtml}}</section>","templateHtml":"<section style='margin:18px 0;text-align:center;padding:10px;background:#fff;border:1px solid #d9f99d;border-radius:8px;'><img src='{{imageUrl}}' alt='{{caption}}' style='max-width:100%;border-radius:4px;'/>{{captionHtml}}</section>"},
    {"id":"tea-zen-divider","blockType":"divider","name":"古典分割","previewHtml":"<section style='margin:20px 0;text-align:center;color:{{color:secondary}};'>✦ ✦ ✦</section>","templateHtml":"<section style='margin:20px 0;text-align:center;color:{{color:secondary}};'>✦ ✦ ✦</section>"},
    {"id":"tea-zen-blockquote","blockType":"blockquote","name":"文摘引用","previewHtml":"<section style='margin:16px 0;padding:12px 14px;background:#f0fdf4;border-radius:8px;border:1px solid #d9f99d;'><blockquote style='margin:0;color:{{color:text}};'>{{content}}</blockquote></section>","templateHtml":"<section style='margin:16px 0;padding:12px 14px;background:#f0fdf4;border-radius:8px;border:1px solid #d9f99d;'><blockquote style='margin:0;color:{{color:text}};'>{{content}}</blockquote></section>"}
  ]$$::jsonb,
  30,
  true
),
(
  'timeline-report',
  '时间轴速递',
  'https://dummyimage.com/480x640/eff6ff/1d4ed8&text=Timeline+Report',
  array['资讯', '活动回顾', '发布'],
  'blue',
  false,
  '{"primary":"#1d4ed8","secondary":"#60a5fa","background":"#f8fbff","text":"#1e3a8a","accent":"#0ea5e9"}'::jsonb,
  $$[
    {"id":"timeline-report-article-title","blockType":"article-title","name":"资讯头条","previewHtml":"<section style='padding:16px 0;border-bottom:1px solid #bfdbfe;'><h1 style='margin:0;font-size:30px;color:{{color:primary}};'>{{content}}</h1></section>","templateHtml":"<section style='padding:16px 0;border-bottom:1px solid #bfdbfe;'><h1 style='margin:0;font-size:30px;color:{{color:primary}};'>{{content}}</h1></section>"},
    {"id":"timeline-report-hero-title","blockType":"hero-title","name":"时间轴头图","previewHtml":"<section style='padding:20px 14px;background:#dbeafe;border-radius:12px;'><h2 style='margin:0;color:{{color:primary}};font-size:24px;'>{{content}}</h2></section>","templateHtml":"<section style='padding:20px 14px;background:#dbeafe;border-radius:12px;'><h2 style='margin:0;color:{{color:primary}};font-size:24px;'>{{content}}</h2></section>"},
    {"id":"timeline-report-hero-subtitle","blockType":"hero-subtitle","name":"时间说明","previewHtml":"<section style='margin-top:8px;'><p style='margin:0;color:{{color:secondary}};'>{{content}}</p></section>","templateHtml":"<section style='margin-top:8px;'><p style='margin:0;color:{{color:secondary}};'>{{content}}</p></section>"},
    {"id":"timeline-report-intro","blockType":"intro","name":"导读摘要","previewHtml":"<section style='margin:14px 0;padding:12px 14px;background:#eff6ff;border-left:4px solid {{color:accent}};'><p style='margin:0;line-height:1.85;color:{{color:text}};'>{{content}}</p></section>","templateHtml":"<section style='margin:14px 0;padding:12px 14px;background:#eff6ff;border-left:4px solid {{color:accent}};'><p style='margin:0;line-height:1.85;color:{{color:text}};'>{{content}}</p></section>"},
    {"id":"timeline-report-section-title","blockType":"section-title","name":"节点标题","previewHtml":"<section style='margin:20px 0 8px;display:flex;align-items:center;gap:8px;'><span style='display:inline-block;width:10px;height:10px;border-radius:999px;background:{{color:primary}};'></span><h3 style='margin:0;color:{{color:primary}};font-size:19px;'>{{content}}</h3></section>","templateHtml":"<section style='margin:20px 0 8px;display:flex;align-items:center;gap:8px;'><span style='display:inline-block;width:10px;height:10px;border-radius:999px;background:{{color:primary}};'></span><h3 style='margin:0;color:{{color:primary}};font-size:19px;'>{{content}}</h3></section>"},
    {"id":"timeline-report-section-content","blockType":"section-content","name":"时间轴正文","previewHtml":"<section style='margin:8px 0 12px 18px;padding-left:12px;border-left:2px dashed #93c5fd;'><p style='margin:0;line-height:1.85;color:{{color:text}};'>{{content}}</p></section>","templateHtml":"<section style='margin:8px 0 12px 18px;padding-left:12px;border-left:2px dashed #93c5fd;'><p style='margin:0;line-height:1.85;color:{{color:text}};'>{{content}}</p></section>"},
    {"id":"timeline-report-image","blockType":"image","name":"时间节点配图","previewHtml":"<section style='margin:16px 0 16px 18px;text-align:center;'><img src='{{imageUrl}}' alt='{{caption}}' style='max-width:100%;border-radius:10px;border:1px solid #bfdbfe;'/>{{captionHtml}}</section>","templateHtml":"<section style='margin:16px 0 16px 18px;text-align:center;'><img src='{{imageUrl}}' alt='{{caption}}' style='max-width:100%;border-radius:10px;border:1px solid #bfdbfe;'/>{{captionHtml}}</section>"},
    {"id":"timeline-report-divider","blockType":"divider","name":"节点分隔","previewHtml":"<section style='margin:18px 0;text-align:center;'><span style='display:inline-block;width:72px;height:2px;background:linear-gradient(90deg, transparent, {{color:secondary}}, transparent);'></span></section>","templateHtml":"<section style='margin:18px 0;text-align:center;'><span style='display:inline-block;width:72px;height:2px;background:linear-gradient(90deg, transparent, {{color:secondary}}, transparent);'></span></section>"},
    {"id":"timeline-report-blockquote","blockType":"blockquote","name":"资讯引用","previewHtml":"<section style='margin:16px 0;padding:12px 14px;background:#eff6ff;border-radius:8px;'><blockquote style='margin:0;color:{{color:primary}};'>{{content}}</blockquote></section>","templateHtml":"<section style='margin:16px 0;padding:12px 14px;background:#eff6ff;border-radius:8px;'><blockquote style='margin:0;color:{{color:primary}};'>{{content}}</blockquote></section>"}
  ]$$::jsonb,
  40,
  true
),
(
  'black-gold-launch',
  '黑金发布',
  'https://dummyimage.com/480x640/111827/f59e0b&text=Black+Gold',
  array['发布', '品牌', '高端'],
  'black',
  true,
  '{"primary":"#111827","secondary":"#f59e0b","background":"#0b0f1a","text":"#f3f4f6","accent":"#fbbf24"}'::jsonb,
  $$[
    {"id":"black-gold-launch-article-title","blockType":"article-title","name":"黑金标题","previewHtml":"<section style='padding:20px 0;text-align:center;'><h1 style='margin:0;font-size:30px;color:{{color:accent}};font-weight:800;'>{{content}}</h1></section>","templateHtml":"<section style='padding:20px 0;text-align:center;'><h1 style='margin:0;font-size:30px;color:{{color:accent}};font-weight:800;'>{{content}}</h1></section>"},
    {"id":"black-gold-launch-hero-title","blockType":"hero-title","name":"发布首屏","previewHtml":"<section style='padding:24px 16px;background:linear-gradient(160deg, #111827, #1f2937);border:1px solid #f59e0b;border-radius:14px;'><h2 style='margin:0;color:{{color:accent}};font-size:24px;text-align:center;'>{{content}}</h2></section>","templateHtml":"<section style='padding:24px 16px;background:linear-gradient(160deg, #111827, #1f2937);border:1px solid #f59e0b;border-radius:14px;'><h2 style='margin:0;color:{{color:accent}};font-size:24px;text-align:center;'>{{content}}</h2></section>"},
    {"id":"black-gold-launch-hero-subtitle","blockType":"hero-subtitle","name":"发布副标题","previewHtml":"<section style='margin-top:8px;text-align:center;'><p style='margin:0;color:#fde68a;'>{{content}}</p></section>","templateHtml":"<section style='margin-top:8px;text-align:center;'><p style='margin:0;color:#fde68a;'>{{content}}</p></section>"},
    {"id":"black-gold-launch-intro","blockType":"intro","name":"发布导语","previewHtml":"<section style='margin:14px 0;padding:14px;border-radius:10px;background:#111827;border:1px solid #374151;'><p style='margin:0;color:{{color:text}};line-height:1.85;'>{{content}}</p></section>","templateHtml":"<section style='margin:14px 0;padding:14px;border-radius:10px;background:#111827;border:1px solid #374151;'><p style='margin:0;color:{{color:text}};line-height:1.85;'>{{content}}</p></section>"},
    {"id":"black-gold-launch-section-title","blockType":"section-title","name":"金线标题","previewHtml":"<section style='margin:20px 0 10px;padding-bottom:6px;border-bottom:1px solid #f59e0b;'><h3 style='margin:0;color:{{color:accent}};font-size:19px;'>{{content}}</h3></section>","templateHtml":"<section style='margin:20px 0 10px;padding-bottom:6px;border-bottom:1px solid #f59e0b;'><h3 style='margin:0;color:{{color:accent}};font-size:19px;'>{{content}}</h3></section>"},
    {"id":"black-gold-launch-section-content","blockType":"section-content","name":"深色正文","previewHtml":"<section style='margin:10px 0;'><p style='margin:0;color:{{color:text}};line-height:1.85;'>{{content}}</p></section>","templateHtml":"<section style='margin:10px 0;'><p style='margin:0;color:{{color:text}};line-height:1.85;'>{{content}}</p></section>"},
    {"id":"black-gold-launch-image","blockType":"image","name":"舞台配图","previewHtml":"<section style='margin:18px 0;text-align:center;'><img src='{{imageUrl}}' alt='{{caption}}' style='max-width:100%;border-radius:10px;border:1px solid #f59e0b;'/>{{captionHtml}}</section>","templateHtml":"<section style='margin:18px 0;text-align:center;'><img src='{{imageUrl}}' alt='{{caption}}' style='max-width:100%;border-radius:10px;border:1px solid #f59e0b;'/>{{captionHtml}}</section>"},
    {"id":"black-gold-launch-divider","blockType":"divider","name":"金色分割","previewHtml":"<section style='margin:20px 0;text-align:center;color:{{color:accent}};'>◆ ◆ ◆</section>","templateHtml":"<section style='margin:20px 0;text-align:center;color:{{color:accent}};'>◆ ◆ ◆</section>"},
    {"id":"black-gold-launch-blockquote","blockType":"blockquote","name":"高亮引用","previewHtml":"<section style='margin:16px 0;padding:12px 14px;background:#1f2937;border-left:3px solid #f59e0b;'><blockquote style='margin:0;color:#fde68a;'>{{content}}</blockquote></section>","templateHtml":"<section style='margin:16px 0;padding:12px 14px;background:#1f2937;border-left:3px solid #f59e0b;'><blockquote style='margin:0;color:#fde68a;'>{{content}}</blockquote></section>"}
  ]$$::jsonb,
  50,
  true
),
(
  'ocean-cards',
  '海盐卡片',
  'https://dummyimage.com/480x640/ecfeff/0891b2&text=Ocean+Cards',
  array['课程介绍', '社群', '科普'],
  'blue',
  false,
  '{"primary":"#0891b2","secondary":"#22d3ee","background":"#f0fdff","text":"#155e75","accent":"#06b6d4"}'::jsonb,
  $$[
    {"id":"ocean-cards-article-title","blockType":"article-title","name":"海风标题","previewHtml":"<section style='padding:18px 0;text-align:center;'><h1 style='margin:0;font-size:30px;color:{{color:primary}};'>{{content}}</h1></section>","templateHtml":"<section style='padding:18px 0;text-align:center;'><h1 style='margin:0;font-size:30px;color:{{color:primary}};'>{{content}}</h1></section>"},
    {"id":"ocean-cards-hero-title","blockType":"hero-title","name":"浪花标题","previewHtml":"<section style='padding:22px 16px;border-radius:14px;background:linear-gradient(135deg,#cffafe,#ecfeff);'><h2 style='margin:0;color:{{color:primary}};font-size:24px;'>{{content}}</h2></section>","templateHtml":"<section style='padding:22px 16px;border-radius:14px;background:linear-gradient(135deg,#cffafe,#ecfeff);'><h2 style='margin:0;color:{{color:primary}};font-size:24px;'>{{content}}</h2></section>"},
    {"id":"ocean-cards-hero-subtitle","blockType":"hero-subtitle","name":"海风副标题","previewHtml":"<section style='margin-top:8px;'><p style='margin:0;color:{{color:secondary}};'>{{content}}</p></section>","templateHtml":"<section style='margin-top:8px;'><p style='margin:0;color:{{color:secondary}};'>{{content}}</p></section>"},
    {"id":"ocean-cards-intro","blockType":"intro","name":"气泡引言","previewHtml":"<section style='margin:14px 0;padding:14px;border-radius:14px;background:#ecfeff;'><p style='margin:0;color:{{color:text}};line-height:1.85;'>{{content}}</p></section>","templateHtml":"<section style='margin:14px 0;padding:14px;border-radius:14px;background:#ecfeff;'><p style='margin:0;color:{{color:text}};line-height:1.85;'>{{content}}</p></section>"},
    {"id":"ocean-cards-section-title","blockType":"section-title","name":"海蓝小标题","previewHtml":"<section style='margin:20px 0 10px;'><h3 style='margin:0;color:{{color:primary}};font-size:19px;'>🌊 {{content}}</h3></section>","templateHtml":"<section style='margin:20px 0 10px;'><h3 style='margin:0;color:{{color:primary}};font-size:19px;'>🌊 {{content}}</h3></section>"},
    {"id":"ocean-cards-section-content","blockType":"section-content","name":"清爽正文","previewHtml":"<section style='margin:10px 0;'><p style='margin:0;color:{{color:text}};line-height:1.85;'>{{content}}</p></section>","templateHtml":"<section style='margin:10px 0;'><p style='margin:0;color:{{color:text}};line-height:1.85;'>{{content}}</p></section>"},
    {"id":"ocean-cards-image","blockType":"image","name":"漂浮配图","previewHtml":"<section style='margin:18px 0;text-align:center;'><img src='{{imageUrl}}' alt='{{caption}}' style='max-width:100%;border-radius:12px;box-shadow:0 8px 20px rgba(14,116,144,0.16);'/>{{captionHtml}}</section>","templateHtml":"<section style='margin:18px 0;text-align:center;'><img src='{{imageUrl}}' alt='{{caption}}' style='max-width:100%;border-radius:12px;box-shadow:0 8px 20px rgba(14,116,144,0.16);'/>{{captionHtml}}</section>"},
    {"id":"ocean-cards-divider","blockType":"divider","name":"海浪分割","previewHtml":"<section style='margin:20px 0;text-align:center;color:{{color:secondary}};'>≈ ≈ ≈</section>","templateHtml":"<section style='margin:20px 0;text-align:center;color:{{color:secondary}};'>≈ ≈ ≈</section>"},
    {"id":"ocean-cards-blockquote","blockType":"blockquote","name":"清爽引用","previewHtml":"<section style='margin:16px 0;padding:12px 14px;background:#ecfeff;border-left:3px solid {{color:primary}};'><blockquote style='margin:0;color:{{color:text}};'>{{content}}</blockquote></section>","templateHtml":"<section style='margin:16px 0;padding:12px 14px;background:#ecfeff;border-left:3px solid {{color:primary}};'><blockquote style='margin:0;color:{{color:text}};'>{{content}}</blockquote></section>"}
  ]$$::jsonb,
  60,
  true
),
(
  'festive-red',
  '节庆喜庆',
  'https://dummyimage.com/480x640/fff1f2/be123c&text=Festive+Red',
  array['节日', '通知', '活动预告'],
  'red',
  true,
  '{"primary":"#be123c","secondary":"#fb7185","background":"#fff7f7","text":"#881337","accent":"#e11d48"}'::jsonb,
  $$[
    {"id":"festive-red-article-title","blockType":"article-title","name":"节庆主标题","previewHtml":"<section style='padding:18px 0;text-align:center;'><h1 style='margin:0;font-size:30px;color:{{color:primary}};font-weight:800;'>{{content}}</h1></section>","templateHtml":"<section style='padding:18px 0;text-align:center;'><h1 style='margin:0;font-size:30px;color:{{color:primary}};font-weight:800;'>{{content}}</h1></section>"},
    {"id":"festive-red-hero-title","blockType":"hero-title","name":"红锦标题","previewHtml":"<section style='padding:24px 16px;border-radius:12px;background:linear-gradient(135deg,#fecdd3,#ffe4e6);'><h2 style='margin:0;color:{{color:primary}};font-size:24px;text-align:center;'>{{content}}</h2></section>","templateHtml":"<section style='padding:24px 16px;border-radius:12px;background:linear-gradient(135deg,#fecdd3,#ffe4e6);'><h2 style='margin:0;color:{{color:primary}};font-size:24px;text-align:center;'>{{content}}</h2></section>"},
    {"id":"festive-red-hero-subtitle","blockType":"hero-subtitle","name":"祝福副标题","previewHtml":"<section style='margin-top:8px;text-align:center;'><p style='margin:0;color:{{color:secondary}};'>{{content}}</p></section>","templateHtml":"<section style='margin-top:8px;text-align:center;'><p style='margin:0;color:{{color:secondary}};'>{{content}}</p></section>"},
    {"id":"festive-red-intro","blockType":"intro","name":"祝词引言","previewHtml":"<section style='margin:14px 0;padding:14px;border-radius:10px;background:#fff1f2;border:1px solid #fecdd3;'><p style='margin:0;color:{{color:text}};line-height:1.85;'>{{content}}</p></section>","templateHtml":"<section style='margin:14px 0;padding:14px;border-radius:10px;background:#fff1f2;border:1px solid #fecdd3;'><p style='margin:0;color:{{color:text}};line-height:1.85;'>{{content}}</p></section>"},
    {"id":"festive-red-section-title","blockType":"section-title","name":"锦囊标题","previewHtml":"<section style='margin:20px 0 10px;'><h3 style='margin:0;color:#fff;font-size:18px;display:inline-block;background:{{color:primary}};padding:5px 12px;border-radius:6px;'>{{content}}</h3></section>","templateHtml":"<section style='margin:20px 0 10px;'><h3 style='margin:0;color:#fff;font-size:18px;display:inline-block;background:{{color:primary}};padding:5px 12px;border-radius:6px;'>{{content}}</h3></section>"},
    {"id":"festive-red-section-content","blockType":"section-content","name":"喜庆正文","previewHtml":"<section style='margin:10px 0;'><p style='margin:0;color:{{color:text}};line-height:1.85;'>{{content}}</p></section>","templateHtml":"<section style='margin:10px 0;'><p style='margin:0;color:{{color:text}};line-height:1.85;'>{{content}}</p></section>"},
    {"id":"festive-red-image","blockType":"image","name":"节庆配图","previewHtml":"<section style='margin:18px 0;text-align:center;'><img src='{{imageUrl}}' alt='{{caption}}' style='max-width:100%;border-radius:10px;border:2px solid #fecdd3;'/>{{captionHtml}}</section>","templateHtml":"<section style='margin:18px 0;text-align:center;'><img src='{{imageUrl}}' alt='{{caption}}' style='max-width:100%;border-radius:10px;border:2px solid #fecdd3;'/>{{captionHtml}}</section>"},
    {"id":"festive-red-divider","blockType":"divider","name":"祥云分隔","previewHtml":"<section style='margin:20px 0;text-align:center;color:{{color:secondary}};'>✿ ✿ ✿</section>","templateHtml":"<section style='margin:20px 0;text-align:center;color:{{color:secondary}};'>✿ ✿ ✿</section>"},
    {"id":"festive-red-blockquote","blockType":"blockquote","name":"祝福引用","previewHtml":"<section style='margin:16px 0;padding:12px 14px;background:#fff1f2;border-left:3px solid {{color:primary}};'><blockquote style='margin:0;color:{{color:primary}};'>{{content}}</blockquote></section>","templateHtml":"<section style='margin:16px 0;padding:12px 14px;background:#fff1f2;border-left:3px solid {{color:primary}};'><blockquote style='margin:0;color:{{color:primary}};'>{{content}}</blockquote></section>"}
  ]$$::jsonb,
  70,
  true
),
(
  'minimal-journal',
  '极简杂志',
  'https://dummyimage.com/480x640/f9fafb/1f2937&text=Minimal+Journal',
  array['极简', '专栏', '深度内容'],
  'white',
  false,
  '{"primary":"#1f2937","secondary":"#6b7280","background":"#ffffff","text":"#374151","accent":"#111827"}'::jsonb,
  $$[
    {"id":"minimal-journal-article-title","blockType":"article-title","name":"极简主标题","previewHtml":"<section style='padding:18px 0;'><h1 style='margin:0;font-size:32px;line-height:1.3;color:{{color:primary}};'>{{content}}</h1></section>","templateHtml":"<section style='padding:18px 0;'><h1 style='margin:0;font-size:32px;line-height:1.3;color:{{color:primary}};'>{{content}}</h1></section>"},
    {"id":"minimal-journal-hero-title","blockType":"hero-title","name":"封面标题","previewHtml":"<section style='padding:20px 0;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;'><h2 style='margin:0;font-size:24px;color:{{color:primary}};'>{{content}}</h2></section>","templateHtml":"<section style='padding:20px 0;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;'><h2 style='margin:0;font-size:24px;color:{{color:primary}};'>{{content}}</h2></section>"},
    {"id":"minimal-journal-hero-subtitle","blockType":"hero-subtitle","name":"封面副标题","previewHtml":"<section style='margin-top:8px;'><p style='margin:0;color:{{color:secondary}};'>{{content}}</p></section>","templateHtml":"<section style='margin-top:8px;'><p style='margin:0;color:{{color:secondary}};'>{{content}}</p></section>"},
    {"id":"minimal-journal-intro","blockType":"intro","name":"摘要导语","previewHtml":"<section style='margin:14px 0;'><p style='margin:0;color:{{color:text}};font-size:17px;line-height:1.9;'>{{content}}</p></section>","templateHtml":"<section style='margin:14px 0;'><p style='margin:0;color:{{color:text}};font-size:17px;line-height:1.9;'>{{content}}</p></section>"},
    {"id":"minimal-journal-section-title","blockType":"section-title","name":"极简小标题","previewHtml":"<section style='margin:22px 0 10px;'><h3 style='margin:0;font-size:20px;color:{{color:primary}};'>{{content}}</h3></section>","templateHtml":"<section style='margin:22px 0 10px;'><h3 style='margin:0;font-size:20px;color:{{color:primary}};'>{{content}}</h3></section>"},
    {"id":"minimal-journal-section-content","blockType":"section-content","name":"杂志正文","previewHtml":"<section style='margin:10px 0;'><p style='margin:0;color:{{color:text}};line-height:1.95;text-align:justify;'>{{content}}</p></section>","templateHtml":"<section style='margin:10px 0;'><p style='margin:0;color:{{color:text}};line-height:1.95;text-align:justify;'>{{content}}</p></section>"},
    {"id":"minimal-journal-image","blockType":"image","name":"留白配图","previewHtml":"<section style='margin:20px 0;text-align:center;'><img src='{{imageUrl}}' alt='{{caption}}' style='max-width:100%;border-radius:4px;'/>{{captionHtml}}</section>","templateHtml":"<section style='margin:20px 0;text-align:center;'><img src='{{imageUrl}}' alt='{{caption}}' style='max-width:100%;border-radius:4px;'/>{{captionHtml}}</section>"},
    {"id":"minimal-journal-divider","blockType":"divider","name":"细线分割","previewHtml":"<section style='margin:20px 0;'><hr style='border:none;border-top:1px solid #e5e7eb;'/></section>","templateHtml":"<section style='margin:20px 0;'><hr style='border:none;border-top:1px solid #e5e7eb;'/></section>"},
    {"id":"minimal-journal-blockquote","blockType":"blockquote","name":"简约引用","previewHtml":"<section style='margin:16px 0;padding:10px 0 10px 12px;border-left:2px solid #d1d5db;'><blockquote style='margin:0;color:{{color:secondary}};'>{{content}}</blockquote></section>","templateHtml":"<section style='margin:16px 0;padding:10px 0 10px 12px;border-left:2px solid #d1d5db;'><blockquote style='margin:0;color:{{color:secondary}};'>{{content}}</blockquote></section>"}
  ]$$::jsonb,
  80,
  true
)
on conflict (id) do update set
  name = excluded.name,
  thumbnail = excluded.thumbnail,
  categories = excluded.categories,
  color_family = excluded.color_family,
  has_hero_image = excluded.has_hero_image,
  color_scheme = excluded.color_scheme,
  block_styles = excluded.block_styles,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  updated_at = now();
