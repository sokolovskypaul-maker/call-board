# הנחיות לסוכנים

## אנימציות
כל בקשה לאנימציה, סרטון, ריל, אייקון או לוגו זז, או אזור מונפש באתר, עוברת דרך הסקיל `animation-styles` (`.claude/skills/animation-styles/SKILL.md`), או דרך הסוכן `animator`.
- 20 סגנונות, כולם בקוד, ויצוא ל-MP4 בלי תוכנת עריכה. בסקיל יש מתכון ומשפט מדויק לכל סגנון.
- נקודת התחלה שעובדת: `.claude/skills/animation-styles/styles.html`. רינדור: `node .claude/skills/animation-styles/render.cjs --style <n|id> --out <file>.mp4`.
- סרטונים לרשתות נשמרים ב-`social/`.

## לפני כל העלאה
- `node check_no_pii.mjs`
- אחרי שינוי ב-`app.js` או ב-`config.js`, מעלים את ה-`?v=` שלהם ב-`index.html`.
