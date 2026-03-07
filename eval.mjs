// ============================================================
// EVAL HARNESS - extracted core functions from index.html
// ============================================================

function daysBetween(a, b) {
	return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function pick(arr) {
	return arr[Math.floor(Math.random() * arr.length)];
}

function classifySeverity(msgsPerDay) {
	if (msgsPerDay < 100)
		return { level: 1, label: 'Casual User', color: 'var(--green)', desc: pick(['a', 'b', 'c']) };
	if (msgsPerDay < 500)
		return { level: 2, label: 'Regular', color: 'var(--green)', desc: pick(['a', 'b']) };
	if (msgsPerDay < 2000)
		return { level: 3, label: 'Power User', color: 'var(--blue)', desc: pick(['a', 'b', 'c']) };
	if (msgsPerDay < 5000)
		return { level: 4, label: 'Enthusiast', color: 'var(--yellow)', desc: pick(['a', 'b']) };
	if (msgsPerDay < 10000)
		return { level: 5, label: 'Codependent', color: 'var(--yellow)', desc: pick(['a', 'b']) };
	return { level: 6, label: 'Terminal Case', color: 'var(--red)', desc: pick(['a', 'b', 'c']) };
}

const RATES = {
	'claude-opus-4-6': { input: 15, output: 75, cacheRead: 1.875, cacheWrite: 18.75 },
	'claude-opus-4-5-20251101': { input: 15, output: 75, cacheRead: 1.875, cacheWrite: 18.75 },
	'claude-sonnet-4-6': { input: 3, output: 15, cacheRead: 0.375, cacheWrite: 3.75 },
	'claude-sonnet-4-5-20250929': { input: 3, output: 15, cacheRead: 0.375, cacheWrite: 3.75 },
	'claude-haiku-4-5-20251001': { input: 0.25, output: 1.25, cacheRead: 0.025, cacheWrite: 0.3 },
};
const FALLBACK_RATE = RATES['claude-opus-4-6'];

function calculateCosts(modelUsage) {
	let total = 0;
	const breakdown = {};
	for (const [model, usage] of Object.entries(modelUsage)) {
		const r = RATES[model] || FALLBACK_RATE;
		const cost =
			((usage.inputTokens || 0) / 1e6) * r.input +
			((usage.outputTokens || 0) / 1e6) * r.output +
			((usage.cacheReadInputTokens || 0) / 1e6) * r.cacheRead +
			((usage.cacheCreationInputTokens || 0) / 1e6) * r.cacheWrite;
		breakdown[model] = cost;
		total += cost;
	}
	return { breakdown, total };
}

function analyzeData(raw) {
	const days = raw.dailyActivity || [];
	const firstDate = raw.firstSessionDate
		? new Date(raw.firstSessionDate)
		: new Date(days[0]?.date);
	const lastDate = new Date(days[days.length - 1]?.date);
	const calendarDays = daysBetween(firstDate, lastDate) + 1;

	const hours = raw.hourCounts || {};
	const totalHourSessions = Object.values(hours).reduce((a, b) => a + b, 0);
	const nightHours = [23, 0, 1, 2, 3, 4, 5, 6];
	const nightSessions = nightHours.reduce((s, h) => s + (hours[h] || 0), 0);
	const peakHour = Object.entries(hours).sort((a, b) => b[1] - a[1])[0];

	const topDays = [...days].sort((a, b) => b.messageCount - a.messageCount).slice(0, 5);
	const costBreakdown = calculateCosts(raw.modelUsage || {});
	const msgsPerDay = raw.totalMessages / (days.length || 1);
	const severity = classifySeverity(msgsPerDay);

	const longest = raw.longestSession || {};
	const longestHours = longest.duration ? (longest.duration / 1000 / 60 / 60).toFixed(1) : 0;

	let totalTokens = 0;
	Object.values(raw.modelUsage || {}).forEach((u) => {
		totalTokens += (u.inputTokens || 0) + (u.outputTokens || 0) +
			(u.cacheReadInputTokens || 0) + (u.cacheCreationInputTokens || 0);
	});

	return {
		firstDate, lastDate, calendarDays,
		activeDays: days.length,
		totalMessages: raw.totalMessages || 0,
		totalSessions: raw.totalSessions || 0,
		msgsPerActiveDay: Math.round(msgsPerDay),
		msgsPerCalendarDay: Math.round((raw.totalMessages || 0) / (calendarDays || 1)),
		dailyActivity: days,
		maxDailyMessages: Math.max(...days.map((d) => d.messageCount), 1),
		hours, totalHourSessions, nightSessions, peakHour,
		topDays, costBreakdown, severity, longest, longestHours, totalTokens,
		isInterview: raw.source === 'interview',
	};
}

function synthesizeFromInterview(answers) {
	const start = new Date(answers.startDate);
	const now = new Date();
	const totalCalendarDays = Math.max(1, Math.round((now - start) / (1000 * 60 * 60 * 24)));

	let activeDayRatio;
	if (answers.dailyHours <= 0.5) activeDayRatio = 0.3;
	else if (answers.dailyHours <= 2) activeDayRatio = 0.5;
	else if (answers.dailyHours <= 5) activeDayRatio = 0.7;
	else if (answers.dailyHours <= 8) activeDayRatio = 0.85;
	else activeDayRatio = 0.95;

	let weekendMultiplier;
	if (answers.weekends === 'never') weekendMultiplier = 0;
	else if (answers.weekends === 'sometimes') weekendMultiplier = 0.3;
	else if (answers.weekends === 'regularly') weekendMultiplier = 0.7;
	else weekendMultiplier = 1.0;

	let mobileMultiplier = 1;
	if (answers.mobile === 'rarely') mobileMultiplier = 1.1;
	else if (answers.mobile === 'sometimes') mobileMultiplier = 1.25;
	else if (answers.mobile === 'regularly') mobileMultiplier = 1.5;

	const effectiveConversations = Math.round(answers.conversations * mobileMultiplier);
	const baseMsgsPerConv = answers.dailyHours <= 0.5 ? 30
		: answers.dailyHours <= 2 ? 100
		: answers.dailyHours <= 5 ? 300
		: answers.dailyHours <= 8 ? 650
		: 1100;
	const convIntensity = answers.conversations <= 20 ? 1
		: answers.conversations <= 75 ? 1.2
		: answers.conversations <= 200 ? 1.6
		: answers.conversations <= 500 ? 2
		: 2.5;
	const msgsPerConv = Math.round(baseMsgsPerConv * convIntensity);
	const totalMessages = effectiveConversations * msgsPerConv;
	const totalSessions = Math.round(effectiveConversations * 1.5);

	const dailyActivity = [];
	const activeDays = Math.round(totalCalendarDays * activeDayRatio);
	const msgsPerActiveDay = Math.round(totalMessages / Math.max(1, activeDays));

	for (let i = 0; i < totalCalendarDays; i++) {
		const d = new Date(start);
		d.setDate(d.getDate() + i);
		const dow = d.getDay();
		const isWeekend = dow === 0 || dow === 6;

		let isActive;
		if (isWeekend) {
			isActive = Math.random() < weekendMultiplier * activeDayRatio;
		} else {
			isActive = Math.random() < activeDayRatio;
		}

		if (isActive) {
			const variance = 0.3 + Math.random() * 1.4;
			const dayMsgs = Math.max(1, Math.round(msgsPerActiveDay * variance));
			const daySessions = Math.max(1, Math.round(dayMsgs / msgsPerConv * 1.2));
			const dayDate = d.toISOString().split('T')[0];
			dailyActivity.push({
				date: dayDate,
				messageCount: dayMsgs,
				sessionCount: daySessions,
				toolCallCount: 0,
			});
		}
	}

	const hourCounts = {};
	const sessionsForHours = totalSessions;
	const peak = answers.startHour;
	for (let h = 0; h < 24; h++) {
		const hoursFromPeak = Math.min(Math.abs(h - peak), 24 - Math.abs(h - peak));
		const halfSpread = Math.max(2, answers.dailyHours / 2);
		if (hoursFromPeak <= halfSpread) {
			const weight = 1 - (hoursFromPeak / halfSpread) * 0.7;
			hourCounts[h] = Math.max(1, Math.round(sessionsForHours / (answers.dailyHours + 1) * weight));
		}
	}

	if (answers.mobile === 'sometimes' || answers.mobile === 'regularly') {
		const mobileWeight = answers.mobile === 'regularly' ? 3 : 1.5;
		hourCounts[7] = (hourCounts[7] || 0) + Math.round(8 * mobileWeight);
		hourCounts[8] = (hourCounts[8] || 0) + Math.round(5 * mobileWeight);
		hourCounts[20] = (hourCounts[20] || 0) + Math.round(6 * mobileWeight);
		hourCounts[21] = (hourCounts[21] || 0) + Math.round(10 * mobileWeight);
		hourCounts[22] = (hourCounts[22] || 0) + Math.round(5 * mobileWeight);
	}

	if (answers.midnight === 'once') {
		hourCounts[23] = (hourCounts[23] || 0) + 2;
		hourCounts[0] = (hourCounts[0] || 0) + 1;
	} else if (answers.midnight === 'sometimes') {
		hourCounts[23] = (hourCounts[23] || 0) + 8;
		hourCounts[0] = (hourCounts[0] || 0) + 5;
		hourCounts[1] = (hourCounts[1] || 0) + 2;
	} else if (answers.midnight === 'regularly') {
		hourCounts[23] = (hourCounts[23] || 0) + 20;
		hourCounts[0] = (hourCounts[0] || 0) + 15;
		hourCounts[1] = (hourCounts[1] || 0) + 10;
		hourCounts[2] = (hourCounts[2] || 0) + 5;
	}

	const longestDuration = answers.longestSession * 60 * 60 * 1000;
	const longestMsgCount = Math.round(answers.longestSession * msgsPerConv * 0.8);
	const actualTotalMessages = dailyActivity.reduce((s, d) => s + d.messageCount, 0);

	return {
		version: 2,
		source: 'interview',
		dailyActivity,
		totalSessions,
		totalMessages: actualTotalMessages,
		longestSession: { duration: longestDuration, messageCount: longestMsgCount },
		firstSessionDate: start.toISOString(),
		hourCounts,
		modelUsage: {},
	};
}

// ============================================================
// EVAL DATASET - stats-cache path
// ============================================================

function makeStatsCacheInput(totalMessages, activeDays, label) {
	const days = [];
	const msgsPerDay = Math.round(totalMessages / activeDays);
	const start = new Date('2026-01-01');
	for (let i = 0; i < activeDays; i++) {
		const d = new Date(start);
		d.setDate(d.getDate() + i);
		days.push({
			date: d.toISOString().split('T')[0],
			messageCount: msgsPerDay,
			sessionCount: Math.max(1, Math.round(msgsPerDay / 20)),
			toolCallCount: 0,
		});
	}
	return { label, totalMessages, totalSessions: activeDays * 2, dailyActivity: days, hourCounts: { 9: 10, 10: 15, 14: 12 }, modelUsage: {}, longestSession: { duration: 3600000, messageCount: 50 }, firstSessionDate: start.toISOString() };
}

// Normal-ish distribution: more samples in middle levels, fewer at extremes
const statsCacheTests = [
	// Level 1 (< 100 msgs/day) - 3 samples
	makeStatsCacheInput(50, 1, 'L1: 50 msgs / 1 day = 50/day'),
	makeStatsCacheInput(990, 10, 'L1: 990 msgs / 10 days = 99/day'),
	makeStatsCacheInput(30, 1, 'L1: 30 msgs / 1 day = 30/day'),

	// Boundary: 99 -> L1, 100 -> L2
	makeStatsCacheInput(99, 1, 'BOUNDARY: 99 msgs / 1 day = 99/day -> L1'),
	makeStatsCacheInput(100, 1, 'BOUNDARY: 100 msgs / 1 day = 100/day -> L2'),

	// Level 2 (100-499 msgs/day) - 5 samples
	makeStatsCacheInput(1000, 10, 'L2: 1000 msgs / 10 days = 100/day'),
	makeStatsCacheInput(1500, 10, 'L2: 1500 msgs / 10 days = 150/day'),
	makeStatsCacheInput(3000, 10, 'L2: 3000 msgs / 10 days = 300/day'),
	makeStatsCacheInput(4500, 10, 'L2: 4500 msgs / 10 days = 450/day'),
	makeStatsCacheInput(4990, 10, 'L2: 4990 msgs / 10 days = 499/day'),

	// Boundary: 499 -> L2, 500 -> L3
	makeStatsCacheInput(499, 1, 'BOUNDARY: 499 msgs / 1 day = 499/day -> L2'),
	makeStatsCacheInput(500, 1, 'BOUNDARY: 500 msgs / 1 day = 500/day -> L3'),

	// Level 3 (500-1999 msgs/day) - 8 samples (peak of distribution)
	makeStatsCacheInput(5000, 10, 'L3: 5000 msgs / 10 days = 500/day'),
	makeStatsCacheInput(7500, 10, 'L3: 7500 msgs / 10 days = 750/day'),
	makeStatsCacheInput(10000, 10, 'L3: 10000 msgs / 10 days = 1000/day'),
	makeStatsCacheInput(12000, 10, 'L3: 12000 msgs / 10 days = 1200/day'),
	makeStatsCacheInput(14000, 10, 'L3: 14000 msgs / 10 days = 1400/day'),
	makeStatsCacheInput(16000, 10, 'L3: 16000 msgs / 10 days = 1600/day'),
	makeStatsCacheInput(18000, 10, 'L3: 18000 msgs / 10 days = 1800/day'),
	makeStatsCacheInput(19990, 10, 'L3: 19990 msgs / 10 days = 1999/day'),

	// Boundary: 1999 -> L3, 2000 -> L4
	makeStatsCacheInput(1999, 1, 'BOUNDARY: 1999 msgs / 1 day = 1999/day -> L3'),
	makeStatsCacheInput(2000, 1, 'BOUNDARY: 2000 msgs / 1 day = 2000/day -> L4'),

	// Level 4 (2000-4999 msgs/day) - 8 samples (peak of distribution)
	makeStatsCacheInput(20000, 10, 'L4: 20000 msgs / 10 days = 2000/day'),
	makeStatsCacheInput(25000, 10, 'L4: 25000 msgs / 10 days = 2500/day'),
	makeStatsCacheInput(30000, 10, 'L4: 30000 msgs / 10 days = 3000/day'),
	makeStatsCacheInput(35000, 10, 'L4: 35000 msgs / 10 days = 3500/day'),
	makeStatsCacheInput(40000, 10, 'L4: 40000 msgs / 10 days = 4000/day'),
	makeStatsCacheInput(42000, 10, 'L4: 42000 msgs / 10 days = 4200/day'),
	makeStatsCacheInput(45000, 10, 'L4: 45000 msgs / 10 days = 4500/day'),
	makeStatsCacheInput(49990, 10, 'L4: 49990 msgs / 10 days = 4999/day'),

	// Boundary: 4999 -> L4, 5000 -> L5
	makeStatsCacheInput(4999, 1, 'BOUNDARY: 4999 msgs / 1 day = 4999/day -> L4'),
	makeStatsCacheInput(5000, 1, 'BOUNDARY: 5000 msgs / 1 day = 5000/day -> L5'),

	// Level 5 (5000-9999 msgs/day) - 5 samples
	makeStatsCacheInput(50000, 10, 'L5: 50000 msgs / 10 days = 5000/day'),
	makeStatsCacheInput(60000, 10, 'L5: 60000 msgs / 10 days = 6000/day'),
	makeStatsCacheInput(75000, 10, 'L5: 75000 msgs / 10 days = 7500/day'),
	makeStatsCacheInput(85000, 10, 'L5: 85000 msgs / 10 days = 8500/day'),
	makeStatsCacheInput(99990, 10, 'L5: 99990 msgs / 10 days = 9999/day'),

	// Boundary: 9999 -> L5, 10000 -> L6
	makeStatsCacheInput(9999, 1, 'BOUNDARY: 9999 msgs / 1 day = 9999/day -> L5'),
	makeStatsCacheInput(10000, 1, 'BOUNDARY: 10000 msgs / 1 day = 10000/day -> L6'),

	// Level 6 (10000+ msgs/day) - 3 samples
	makeStatsCacheInput(100000, 10, 'L6: 100000 msgs / 10 days = 10000/day'),
	makeStatsCacheInput(150000, 10, 'L6: 150000 msgs / 10 days = 15000/day'),
	makeStatsCacheInput(500000, 10, 'L6: 500000 msgs / 10 days = 50000/day'),
];

// Expected levels for each test
const expectedLevels = [
	1, 1, 1,        // L1 samples
	1, 2,           // boundary
	2, 2, 2, 2, 2,  // L2 samples
	2, 3,           // boundary
	3, 3, 3, 3, 3, 3, 3, 3,  // L3 samples
	3, 4,           // boundary
	4, 4, 4, 4, 4, 4, 4, 4,  // L4 samples
	4, 5,           // boundary
	5, 5, 5, 5, 5,  // L5 samples
	5, 6,           // boundary
	6, 6, 6,        // L6 samples
];

// ============================================================
// INTERVIEW EXHAUSTIVE DISTRIBUTION
// ============================================================

// All possible answer values from the interview form
const allConversations = [20, 75, 200, 500, 1000];
const allDailyHours = [0.5, 2, 5, 8, 12];
const allWeekends = ['never', 'sometimes', 'regularly', 'always'];
const allMobile = ['never', 'rarely', 'sometimes', 'regularly'];

// Fixed values for dimensions that don't affect severity much
const fixedStart = '2025-10-01';
const fixedStartHour = 9;
const fixedMidnight = 'sometimes';
const fixedLongest = 5;

// ============================================================
// RUN EVAL
// ============================================================

console.log('='.repeat(70));
console.log('STATS-CACHE PATH EVAL');
console.log('='.repeat(70));

let scPass = 0, scFail = 0;
const levelDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };

statsCacheTests.forEach((input, i) => {
	const result = analyzeData(input);
	const expected = expectedLevels[i];
	const actual = result.severity.level;
	const ok = actual === expected;
	levelDistribution[actual]++;

	if (ok) {
		scPass++;
	} else {
		scFail++;
		console.log(`  FAIL: ${input.label}`);
		console.log(`    msgsPerDay=${result.msgsPerActiveDay}, expected L${expected}, got L${actual} (${result.severity.label})`);
	}
});

console.log(`\nResults: ${scPass} passed, ${scFail} failed out of ${statsCacheTests.length}`);
console.log(`Level distribution: ${JSON.stringify(levelDistribution)}`);

console.log('\n' + '='.repeat(70));
console.log('INTERVIEW EXHAUSTIVE DISTRIBUTION');
console.log('='.repeat(70));

// Run every combination of conversations x dailyHours x weekends x mobile
// Average over 5 runs per combo to smooth randomness
const RUNS_PER_COMBO = 5;
const interviewDist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
const comboResults = [];
let totalCombos = 0;

for (const convos of allConversations) {
	for (const hours of allDailyHours) {
		for (const weekends of allWeekends) {
			for (const mobile of allMobile) {
				let levelSum = 0;
				let msgsPerDaySum = 0;
				const levelCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };

				for (let r = 0; r < RUNS_PER_COMBO; r++) {
					const raw = synthesizeFromInterview({
						startDate: fixedStart,
						conversations: convos,
						dailyHours: hours,
						startHour: fixedStartHour,
						weekends,
						midnight: fixedMidnight,
						mobile,
						longestSession: fixedLongest,
					});
					const result = analyzeData(raw);
					levelSum += result.severity.level;
					msgsPerDaySum += result.msgsPerActiveDay;
					levelCounts[result.severity.level]++;
				}

				const avgLevel = levelSum / RUNS_PER_COMBO;
				const avgMsgsPerDay = Math.round(msgsPerDaySum / RUNS_PER_COMBO);
				const modalLevel = parseInt(Object.entries(levelCounts).sort((a, b) => b[1] - a[1])[0][0]);
				interviewDist[modalLevel]++;
				totalCombos++;

				comboResults.push({
					convos, hours, weekends, mobile,
					avgLevel: avgLevel.toFixed(1),
					modalLevel,
					avgMsgsPerDay,
				});
			}
		}
	}
}

// Print distribution chart
console.log(`\nTotal combinations: ${totalCombos} (each run ${RUNS_PER_COMBO}x)\n`);

const labels = {
	1: 'Casual User  ',
	2: 'Regular      ',
	3: 'Power User   ',
	4: 'Enthusiast   ',
	5: 'Codependent  ',
	6: 'Terminal Case ',
};

const maxCount = Math.max(...Object.values(interviewDist));
const barScale = 40 / maxCount;

console.log('  Level distribution across all interview answer combinations:\n');
for (let l = 1; l <= 6; l++) {
	const count = interviewDist[l];
	const pct = ((count / totalCombos) * 100).toFixed(1);
	const bar = '\u2588'.repeat(Math.round(count * barScale));
	console.log(`  L${l} ${labels[l]} ${bar} ${count} (${pct}%)`);
}

// Show the "middle" answers that land at L1 (the bug the user hit)
console.log('\n' + '-'.repeat(70));
console.log('MIDDLE-GROUND COMBOS THAT LAND AT L1 (potential problem):');
console.log('-'.repeat(70));

const middleCombos = comboResults.filter(c =>
	c.convos >= 75 && c.hours >= 2 && c.modalLevel <= 1
);

if (middleCombos.length === 0) {
	console.log('  None found - all middle-ground combos classify above L1');
} else {
	middleCombos.forEach(c => {
		console.log(`  convos=${c.convos} hours=${c.hours} weekends=${c.weekends} mobile=${c.mobile} -> L${c.modalLevel} (avg ${c.avgMsgsPerDay} msgs/day)`);
	});
}

console.log('\n' + '-'.repeat(70));
console.log('FULL GRID: conversations x dailyHours -> modal level');
console.log('-'.repeat(70));

// Header
const hdrHours = allDailyHours.map(h => `${h}h`.padStart(6)).join('');
console.log(`  convos  ${hdrHours}`);
console.log('  ' + '-'.repeat(38));

for (const convos of allConversations) {
	const row = allDailyHours.map(hours => {
		// Get most common level across all weekend/mobile combos
		const matching = comboResults.filter(c => c.convos === convos && c.hours === hours);
		const levelBuckets = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
		matching.forEach(c => levelBuckets[c.modalLevel]++);
		const dominant = parseInt(Object.entries(levelBuckets).sort((a, b) => b[1] - a[1])[0][0]);
		return `L${dominant}`.padStart(6);
	}).join('');
	console.log(`  ${String(convos).padStart(5)}  ${row}`);
}

// ============================================================
// BOUNDARY DEEP-CHECK
// ============================================================

console.log('\n' + '='.repeat(70));
console.log('BOUNDARY VERIFICATION');
console.log('='.repeat(70));

const boundaries = [
	[99, 1], [100, 2],
	[499, 2], [500, 3],
	[1999, 3], [2000, 4],
	[4999, 4], [5000, 5],
	[9999, 5], [10000, 6],
];

let bPass = 0, bFail = 0;
boundaries.forEach(([msgsPerDay, expectedLevel]) => {
	const result = classifySeverity(msgsPerDay);
	const ok = result.level === expectedLevel;
	if (ok) bPass++;
	else {
		bFail++;
		console.log(`  FAIL: classifySeverity(${msgsPerDay}) -> L${result.level}, expected L${expectedLevel}`);
	}
});

console.log(`Direct boundary check: ${bPass} passed, ${bFail} failed out of ${boundaries.length}`);

// ============================================================
// SUMMARY
// ============================================================

const totalPass = scPass + bPass;
const totalFail = scFail + bFail;
const total = totalPass + totalFail;

console.log('\n' + '='.repeat(70));
console.log(`TOTAL: ${totalPass}/${total} passed${totalFail > 0 ? ` (${totalFail} FAILURES)` : ' - ALL CLEAR'}`);
console.log('='.repeat(70));

process.exit(totalFail > 0 ? 1 : 0);
