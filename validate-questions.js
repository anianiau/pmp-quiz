#!/usr/bin/env node
/**
 * PMP問題集 問題データバリデーション
 * 用途: デプロイ前にindex.htmlのJS構文 + 問題データの整合性をチェック
 * 実行: node validate-questions.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const htmlPath = path.join(__dirname, 'index.html');
const html = fs.readFileSync(htmlPath, 'utf-8');

let errors = 0;
let warnings = 0;

function error(msg) { console.error(`  ❌ ${msg}`); errors++; }
function warn(msg) { console.warn(`  ⚠️  ${msg}`); warnings++; }
function ok(msg) { console.log(`  ✅ ${msg}`); }

// --- 1. <script> タグ内のJS構文チェック ---
console.log('\n[1] JS構文チェック');
const scriptRegex = /<script(?:\s[^>]*)?>(?!{)([\s\S]*?)<\/script>/gi;
let match;
let scriptIndex = 0;
while ((match = scriptRegex.exec(html)) !== null) {
  scriptIndex++;
  const code = match[1].trim();
  if (!code || code.startsWith('{') || code.startsWith('window.dataLayer')) continue;
  try {
    new vm.Script(code, { filename: `index.html<script#${scriptIndex}>` });
    ok(`script#${scriptIndex}: 構文OK (${code.length.toLocaleString()} chars)`);
  } catch (e) {
    error(`script#${scriptIndex}: 構文エラー — ${e.message}`);
  }
}

// --- 2. 問題データの抽出と検証 ---
console.log('\n[2] 問題データ検証');
const langArrayNames = ['defaultQuestionsJa', 'defaultQuestionsEn', 'defaultQuestionsKo', 'defaultQuestionsZh', 'defaultQuestionsEs'];
const VALID_DOMAINS = ['People', 'Process', 'Business', 'Predictive', 'Agile'];

for (const varName of langArrayNames) {
  const re = new RegExp(`const\\s+${varName}\\s*=\\s*(\\[\\s*\\{[\\s\\S]*?\\]);`, 'm');
  const m = html.match(re);
  if (!m) {
    warn(`${varName}: 定義が見つかりません（スキップ）`);
    continue;
  }

  let questions;
  try {
    questions = vm.runInNewContext(`(${m[1]})`);
  } catch (e) {
    error(`${varName}: パースエラー — ${e.message}`);
    continue;
  }

  const lang = varName.replace('defaultQuestions', '');
  console.log(`\n  --- ${lang} (${questions.length}問) ---`);

  const ids = new Set();
  let domainCounts = {};

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const label = `${varName}[${i}] (id:${q.id})`;

    // 重複ID
    if (ids.has(q.id)) error(`${label}: ID重複`);
    ids.add(q.id);

    // 必須フィールド
    if (!q.question) error(`${label}: questionが空`);
    if (!q.explanation) error(`${label}: explanationが空`);
    if (!Array.isArray(q.options)) { error(`${label}: optionsが配列でない`); continue; }

    // 選択肢数
    if (q.options.length !== 4) error(`${label}: 選択肢が${q.options.length}個（4個必要）`);

    // correctインデックス
    if (typeof q.correct !== 'number' || q.correct < 0 || q.correct >= q.options.length) {
      error(`${label}: correct=${q.correct} が範囲外`);
    }

    // domain
    if (!VALID_DOMAINS.includes(q.domain)) {
      error(`${label}: domain="${q.domain}" が不正（有効: ${VALID_DOMAINS.join(', ')}）`);
    }
    domainCounts[q.domain] = (domainCounts[q.domain] || 0) + 1;

    // 文字列内の危険な文字
    const allText = q.question + q.options.join('') + q.explanation;
    if (allText.includes('"') && !allText.includes('\\"')) {
      // JSの文字列区切りと衝突する可能性のあるダブルクォーテーション
      // ただし配列パース済みなので実際には問題なし — 念のため警告
    }

    // 空の選択肢
    q.options.forEach((opt, oi) => {
      if (!opt || opt.trim() === '') error(`${label}: options[${oi}]が空`);
    });
  }

  ok(`${lang}: ${questions.length}問チェック完了`);
  console.log(`  📊 ドメイン分布: ${Object.entries(domainCounts).map(([d,c])=>`${d}:${c}`).join(' / ')}`);

  // 正解インデックスの偏りチェック
  const correctDist = [0, 0, 0, 0];
  questions.forEach(q => { if (q.correct >= 0 && q.correct < 4) correctDist[q.correct]++; });
  const pcts = correctDist.map(c => Math.round(c / questions.length * 100));
  console.log(`  📊 正解分布: A:${pcts[0]}% B:${pcts[1]}% C:${pcts[2]}% D:${pcts[3]}%`);
  const maxSkew = Math.max(...pcts) - Math.min(...pcts);
  if (maxSkew > 15) warn(`${lang}: 正解分布の偏りが大きい（差${maxSkew}%）。均等化を検討してください`);
}

// --- 結果サマリー ---
console.log('\n' + '='.repeat(50));
if (errors > 0) {
  console.error(`\n🚨 ${errors}件のエラー / ${warnings}件の警告`);
  process.exit(1);
} else if (warnings > 0) {
  console.log(`\n⚠️  エラーなし / ${warnings}件の警告`);
  process.exit(0);
} else {
  console.log('\n🎉 全チェック合格！');
  process.exit(0);
}
