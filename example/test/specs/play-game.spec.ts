import {browser, expect} from '@wdio/globals'

describe('Avocado Game', () => {
    it('should select openCV as engine and click on the trap', async () => {
        await browser.url('/');
        await browser.pause(4000);
        await browser.clickByMatchingImage('./assets/trap_test.png', {engine: 'opencv'});
    });

    // it('should select fallback as engine and click on the trap', async () => {
    //     await browser.url('/');
    //     await browser.pause(4000);
    //     await browser.clickByMatchingImage('./assets/trap_test.png', {engine: 'fallback'});
    // });
});

