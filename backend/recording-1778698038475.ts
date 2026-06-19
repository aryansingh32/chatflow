const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: false
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('https://onlineservices.proteantech.in/paam/endUserRegisterContact.html');
  await page.locator('#select2-type-container').click();
  await page.getByRole('option', { name: 'New PAN - Form No. 93 (Indian' }).click();
  await page.locator('#f_name_end').click();
  await page.locator('#f_name_end').fill('jhhj');
  await page.locator('#m_name_end').click();
  await page.locator('#m_name_end').fill('gjjh');
  await page.locator('#l_name_end').click();
  await page.locator('#l_name_end').fill('hgf');
  await page.locator('#date_of_birth_reg').click();
  await page.getByRole('cell', { name: '1' }).first().click();
  await page.locator('#email_id2').click();
  await page.locator('#date_of_birth_reg').click();
  await page.locator('#email_id2').click();
  await page.locator('#email_id2').fill('ffjhhjhg');
  page.once('dialog', dialog => {
    console.log(`Dialog message: ${dialog.message()}`);
    dialog.dismiss().catch(() => {});
  });
  await page.locator('#rvContactNo').click();
  // await expect(page.locator('#registerForm')).toMatchAriaSnapshot(`
  //   - text: Date of Birth / Incorporation / Formation (DD/MM/YYYY)*
  //   - textbox: /\\d+\\/\\d+\\/\\d+/
  //   `);

  // ---------------------
  await context.close();
  await browser.close();
})();