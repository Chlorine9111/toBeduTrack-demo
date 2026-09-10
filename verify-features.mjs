import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3000';

async function verify() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const results = [];

  // Test 1: Home 页面 + 教师社区
  await page.goto(`${BASE}/main`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  
  // 滚动到底部检查社区板块
  await page.evaluate(() => {
    const scrollEl = document.querySelector('.overflow-y-auto');
    if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
  });
  await page.waitForTimeout(500);
  
  const communityText = await page.textContent('body');
  const hasCommunity = communityText.includes('教师社区') || communityText.includes('热门教案');
  results.push({ test: 'Home: 教师社区板块存在', pass: hasCommunity });

  // Test 2: Project 页面基本加载
  await page.goto(`${BASE}/main/project`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  
  const hasWorkbench = (await page.textContent('body')).includes('AI 教学工作台');
  results.push({ test: 'Project: 页面正常加载', pass: hasWorkbench });

  // Test 3: 教案流程 - 输入"写教案"
  const input = page.locator('input[type="text"], textarea').first();
  await input.fill('帮我写一个教案');
  await input.press('Enter');
  await page.waitForTimeout(5000);
  
  const bodyAfterLesson = await page.textContent('body');
  const hasLessonIntent = bodyAfterLesson.includes('生成教案');
  results.push({ test: 'Lesson Plan: Intent Card 显示"生成教案"', pass: hasLessonIntent });

  // 检查教案专用选项（课时）
  const hasDuration = bodyAfterLesson.includes('45min') || bodyAfterLesson.includes('课时');
  results.push({ test: 'Lesson Plan: IntentCard 显示课时选项', pass: hasDuration });

  // Test 4: 练习卷流程 - 重新加载进入
  await page.goto(`${BASE}/main/project?prompt=${encodeURIComponent('创建练习卷')}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  
  const bodyWs = await page.textContent('body');
  const hasWorksheet = bodyWs.includes('创建练习卷') || bodyWs.includes('Worksheet');
  results.push({ test: 'Worksheet: Intent Card 存在', pass: hasWorksheet });

  // Test 5: 直接测试筛选模式 - 先生成习题
  await page.goto(`${BASE}/main/project?prompt=${encodeURIComponent('帮我生成8道选择题')}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);
  
  // 确认意图并等待生成
  const confirmBtn = page.locator('button:has-text("确认执行")');
  if (await confirmBtn.count() > 0) {
    await confirmBtn.click();
    // 等待习题生成完成 — LLM 生成可能需要 20-30 秒
    // 轮询等待"筛选模式"出现或超时
    let hasSwipeSuggestion = false;
    for (let i = 0; i < 12; i++) {
      await page.waitForTimeout(5000);
      const text = await page.textContent('body');
      if (text.includes('筛选模式')) {
        hasSwipeSuggestion = true;
        break;
      }
      if (text.includes('已全部生成') || text.includes('生成失败')) break;
    }
    results.push({ test: 'Swipe: 习题生成后显示"筛选模式"按钮', pass: hasSwipeSuggestion });
    
    // 点击筛选模式
    const swipeBtn = page.locator('button:has-text("筛选模式")');
    if (await swipeBtn.count() > 0) {
      await swipeBtn.click();
      await page.waitForTimeout(5000);
      
      const bodySwipe = await page.textContent('body');
      const hasSwipeUI = bodySwipe.includes('筛选模式') && (bodySwipe.includes('保留') || bodySwipe.includes('淘汰'));
      results.push({ test: 'Swipe: 筛选视图正常显示', pass: hasSwipeUI });
    } else {
      results.push({ test: 'Swipe: 筛选视图正常显示', pass: false, note: '未找到筛选模式按钮' });
    }
  } else {
    results.push({ test: 'Swipe: 习题生成后显示"筛选模式"按钮', pass: false, note: '未找到确认按钮' });
    results.push({ test: 'Swipe: 筛选视图正常显示', pass: false, note: '跳过' });
  }

  // 输出结果
  console.log('\n=== 功能验证结果 ===\n');
  let allPass = true;
  for (const r of results) {
    const icon = r.pass ? '✅' : '❌';
    console.log(`${icon} ${r.test}${r.note ? ` (${r.note})` : ''}`);
    if (!r.pass) allPass = false;
  }
  console.log(`\n总计: ${results.filter(r => r.pass).length}/${results.length} 通过`);
  
  await browser.close();
  process.exit(allPass ? 0 : 1);
}

verify().catch(e => { console.error(e); process.exit(1); });
