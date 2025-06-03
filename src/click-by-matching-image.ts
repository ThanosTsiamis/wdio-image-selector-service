import fs from 'fs';
import {PNG} from 'pngjs';
import pixelmatch from 'pixelmatch';


let cv: typeof import('@u4/opencv4nodejs') | null = null;
try {
    cv = require('@u4/opencv4nodejs');
} catch (e) {
    console.warn('OpenCV not available, fallback engine will be used if needed.');
}

export class ClickByMatchingImageService {
    before() {
        browser.addCommand('clickByMatchingImage', async (
            referenceImagePath: string,
            options?: {
                scales?: number[],
                confidence?: number,
                engine?: 'opencv' | 'fallback' | 'auto'
            }
        ) => {
            const confidence = options?.confidence ?? 0.7;
            const scales = options?.scales ?? [1.0, 0.9, 0.8, 0.7, 0.6, 0.5];
            const engine = options?.engine ?? 'auto';

            if (engine === 'opencv') {
                if (!cv) throw new Error('OpenCV engine requested but not available.');
                console.log('[ClickByMatchingImage] Using OpenCV engine.');
                await this.clickByMatchingImageWithOpenCV(referenceImagePath, scales, confidence);
            } else if (engine === 'fallback') {
                console.log('[ClickByMatchingImage] Using fallback engine.');
                await this.clickByMatchingImageFallback(referenceImagePath, confidence);
            } else {
                if (cv) {
                    console.log('[ClickByMatchingImage] Using OpenCV engine (auto).');
                    await this.clickByMatchingImageWithOpenCV(referenceImagePath, scales, confidence);
                } else {
                    console.log('[ClickByMatchingImage] Using fallback engine (auto).');
                    await this.clickByMatchingImageFallback(referenceImagePath, confidence);
                }
            }
        });
    }

    async clickByMatchingImageWithOpenCV(referenceImagePath: string, scales: number[], confidence: number): Promise<void> {
        if (!cv) throw new Error('OpenCV not available.');

        const screenshotPath = './temp-screenshot.png';
        try {
            if (!fs.existsSync(referenceImagePath)) {
                throw new Error(`Reference image not found at path: ${referenceImagePath}`);
            }

            const screenshotBase64 = await browser.takeScreenshot();
            const screenshotBuffer = Buffer.from(screenshotBase64, 'base64');
            fs.writeFileSync(screenshotPath, screenshotBuffer);

            const screenshotMat = cv.imread(screenshotPath);
            const grayScreenshot = screenshotMat.bgrToGray();
            const originalRefMat = cv.imread(referenceImagePath);
            const grayRefOriginal = originalRefMat.bgrToGray();

            let bestMatch = {maxVal: -1, maxLoc: {x: 0, y: 0}, scale: 1.0, refCols: 0, refRows: 0};

            for (const scale of scales) {
                const resizedRef = grayRefOriginal.resize(
                    Math.floor(grayRefOriginal.rows * scale),
                    Math.floor(grayRefOriginal.cols * scale)
                );

                if (resizedRef.rows > grayScreenshot.rows || resizedRef.cols > grayScreenshot.cols) {
                    continue;
                }

                const matched = grayScreenshot.matchTemplate(resizedRef, cv.TM_CCOEFF_NORMED);
                const {maxVal, maxLoc} = matched.minMaxLoc();

                if (maxVal > bestMatch.maxVal) {
                    bestMatch = {maxVal, maxLoc, scale, refCols: resizedRef.cols, refRows: resizedRef.rows};
                }
            }

            if (bestMatch.maxVal >= confidence) {
                const centerX = bestMatch.maxLoc.x + Math.floor(bestMatch.refCols / 2);
                const centerY = bestMatch.maxLoc.y + Math.floor(bestMatch.refRows / 2);

                await browser.performActions([{
                    type: 'pointer',
                    id: 'mouse',
                    parameters: {pointerType: 'mouse'},
                    actions: [
                        {type: 'pointerMove', duration: 0, x: centerX, y: centerY},
                        {type: 'pointerDown', button: 0},
                        {type: 'pointerUp', button: 0},
                    ]
                }]);
            } else {
                throw new Error(`No matching image found with confidence >= ${confidence}. Best match: ${bestMatch.maxVal.toFixed(2)}`);
            }
        } finally {
            if (fs.existsSync(screenshotPath)) {
                fs.unlinkSync(screenshotPath);
            }
        }
    }

    async clickByMatchingImageFallback(referenceImagePath: string, confidence: number): Promise<void> {
        const screenshotPath = './temp-screenshot.png';

        try {
            if (!fs.existsSync(referenceImagePath)) {
                throw new Error(`Reference image not found: ${referenceImagePath}`);
            }

            const screenshotBase64 = await browser.takeScreenshot();
            const screenshotBuffer = Buffer.from(screenshotBase64, 'base64');
            fs.writeFileSync(screenshotPath, screenshotBuffer);

            const screenshotImage = PNG.sync.read(screenshotBuffer);
            const referenceImage = PNG.sync.read(fs.readFileSync(referenceImagePath));
            const {width: refWidth, height: refHeight} = referenceImage;
            const {width: screenWidth, height: screenHeight} = screenshotImage;
            let bestMatch = {x: -1, y: -1, matchConfidence: 0};
            let matchConfidence = 0;
            const diffImage = new PNG({width: screenWidth, height: screenHeight});
            const threshold = Math.floor((1 - confidence) * 255);
            for (let y = 0; y <= screenHeight - refHeight; y++) {
                for (let x = 0; x <= screenWidth - refWidth; x++) {
                    const screenshotRegion = screenshotImage.data.slice(
                        (y * screenWidth + x) * 4,
                        (y * screenWidth + x + refWidth) * 4 + refHeight * screenWidth * 4
                    );
                    const referenceRegion = referenceImage.data;
                    if (screenshotRegion.length !== referenceRegion.length) {
                        continue; // Skip if sizes don't match
                    }
                    // Create a diff image to compare the two regions
                    diffImage.data.fill(0); // Clear diff image
                    diffImage.data.set(screenshotRegion, 0);
                    diffImage.data.set(referenceRegion, 0);
                    const diffCount = pixelmatch(
                        screenshotImage.data, referenceImage.data,
                        diffImage.data, screenWidth, screenHeight,
                        {threshold: threshold / 255}
                    );

                    const currentConfidence = 1 - diffCount / (refWidth * refHeight);
                    if (currentConfidence > matchConfidence) {
                        matchConfidence = currentConfidence;
                        bestMatch = {x, y, matchConfidence: currentConfidence};
                    }
                }
            }
            if (matchConfidence >= confidence) {
                const centerX = bestMatch.x + Math.floor(refWidth / 2);
                const centerY = bestMatch.y + Math.floor(refHeight / 2);

                await browser.performActions([{
                    type: 'pointer',
                    id: 'mouse',
                    parameters: {pointerType: 'mouse'},
                    actions: [
                        {type: 'pointerMove', duration: 0, x: centerX, y: centerY},
                        {type: 'pointerDown', button: 0},
                        {type: 'pointerUp', button: 0},
                    ]
                }]);
            } else {
                throw new Error(`No match found. Best match confidence: ${matchConfidence.toFixed(2)}`);
            }
        } finally {
            if (fs.existsSync(screenshotPath)) {
                fs.unlinkSync(screenshotPath);
            }
        }
    }
}
