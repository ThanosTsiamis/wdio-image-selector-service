import {browser, expect} from '@wdio/globals'

describe('Avocado Game', () => {
    // it('should select openCV as engine and click on the trap', async () => {
    //     await browser.url('/');
    //     await browser.pause(4000);
    //     await browser.clickByMatchingImage('./assets/trap_test.png', {engine: 'opencv'});
    //     await browser.pause(14000);
    // });

    it('should select fallback as engine and click on the trap', async () => {
        await browser.url('/');
        await browser.pause(4000);
        const scoreText = await $('#scoreDisplay').getText();
        expect(scoreText).toBe('Score: 0');
        await browser.clickByMatchingImage('./assets/trap_test.png', {engine: 'fallback'});
        await browser.pause(4000);
        expect(scoreText).toBe('Score:-10');
        await browser.pause(14000);
    });
});

