// ============================================================
// HUMAN BEHAVIOR SIMULATION
// Adds organic randomness to timing, typing, and mouse movements.
// ============================================================
export async function humanDelay(min = 80, max = 250) {
    const delay = min + Math.random() * (max - min);
    await new Promise((r) => setTimeout(r, delay));
}
export async function humanType(page, locator, text) {
    if (!text)
        return;
    await locator.first().scrollIntoViewIfNeeded();
    await humanDelay(100, 200);
    await humanClick(page, locator);
    await humanDelay(80, 150);
    // Clear first if needed
    await locator.first().fill('');
    await humanDelay(50, 100);
    // Type with word bursts and variable delays
    const words = text.split(' ');
    for (let i = 0; i < words.length; i++) {
        const word = words[i] + (i < words.length - 1 ? ' ' : '');
        const burstSize = 1 + Math.floor(Math.random() * 3);
        for (let index = 0; index < word.length; index += burstSize) {
            const chunk = word.slice(index, index + burstSize);
            await page.keyboard.type(chunk);
            // Randomly make a mistake and correct it (2% chance per char)
            if (Math.random() < 0.02) {
                const wrongChar = String.fromCharCode(97 + Math.floor(Math.random() * 26));
                await page.keyboard.type(wrongChar);
                await humanDelay(40, 120);
                await page.keyboard.press('Backspace');
                await humanDelay(40, 100);
            }
            await humanDelay(25, 120);
        }
        // Pause between words
        await humanDelay(100, 300);
    }
}
export async function humanClick(page, locator) {
    const box = await locator.boundingBox();
    if (!box) {
        await locator.click();
        return;
    }
    // Target a point slightly off-center
    const targetX = box.x + box.width * (0.3 + Math.random() * 0.4);
    const targetY = box.y + box.height * (0.3 + Math.random() * 0.4);
    const currentX = targetX - (100 + Math.random() * 300) * (Math.random() > 0.5 ? 1 : -1);
    const currentY = targetY - (100 + Math.random() * 300) * (Math.random() > 0.5 ? 1 : -1);
    const controlX = (currentX + targetX) / 2 + (Math.random() - 0.5) * 120;
    const controlY = (currentY + targetY) / 2 + (Math.random() - 0.5) * 120;
    const points = buildBezierPath({ x: currentX, y: currentY }, { x: controlX, y: controlY }, { x: targetX, y: targetY }, 12 + Math.floor(Math.random() * 8));
    for (const point of points) {
        await page.mouse.move(point.x, point.y);
        if (Math.random() < 0.18) {
            await humanDelay(5, 25);
        }
    }
    await humanDelay(40, 80);
    await page.mouse.down();
    await humanDelay(20, 80);
    await page.mouse.up();
}
export async function humanScroll(page, locator, direction = 'down') {
    if (locator) {
        await locator.first().scrollIntoViewIfNeeded();
    }
    else {
        // Variable speed scrolling
        const steps = 3 + Math.floor(Math.random() * 5);
        for (let i = 0; i < steps; i++) {
            const multiplier = direction === 'down' ? 1 : -1;
            const scrollAmount = multiplier * (80 + Math.random() * 320);
            await page.mouse.wheel(0, scrollAmount);
            if (Math.random() < 0.2) {
                await page.mouse.move(30 + Math.random() * 300, 80 + Math.random() * 400);
            }
            await humanDelay(100, 300);
        }
    }
    await humanDelay(200, 400);
}
function buildBezierPath(start, control, end, samples) {
    const points = [];
    for (let step = 0; step <= samples; step++) {
        const t = step / samples;
        const inverse = 1 - t;
        points.push({
            x: inverse * inverse * start.x + 2 * inverse * t * control.x + t * t * end.x,
            y: inverse * inverse * start.y + 2 * inverse * t * control.y + t * t * end.y,
        });
    }
    return points;
}
//# sourceMappingURL=human-behavior.js.map