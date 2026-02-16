# 🚀 QUICK START GUIDE

## AI Harvard ATS Resume Builder

**Get up and running in 5 minutes!**

---

## ✅ Prerequisites

1. **Node.js 18+** - [Download here](https://nodejs.org/)
2. **Gemini API Key** - [Get FREE key](https://makersuite.google.com/app/apikey)

---

## 📦 Installation Steps

### Step 1: Install Dependencies
```bash
cd harvard-ats-resume
npm install
```

### Step 2: Setup Environment
```bash
cp .env.example .env
```

Edit `.env` file:
```env
GEMINI_API_KEY=your_actual_api_key_here
```

### Step 3: Run Development Server
```bash
npm run dev
```

### Step 4: Open Browser
Navigate to: **http://localhost:3000**

---

## 🎯 How to Use

### 1. Fill Out the Form
Progress through 6 sections:
- **Personal Info**: Name, email, location, LinkedIn, GitHub
- **Summary**: 2-3 sentence professional summary
- **Experience**: Work history with achievements
- **Education**: Degrees and institutions
- **Skills**: Technical and soft skills
- **Job Description**: Paste the job posting (optional but recommended)

### 2. Generate Resume
Click "Generate ATS-Optimized Resume" button

### 3. Review Results
Get instant:
- ✅ **Formatted Resume** (Harvard style)
- ✅ **ATS Score** (0-100%)
- ✅ **Matched Keywords** (from job description)
- ✅ **Missing Keywords** (opportunities to improve)
- ✅ **Suggestions** (actionable improvements)

### 4. Export
- 📄 Download PDF
- 🖨️ Print directly
- 🔄 Create new resume

---

## 💡 Pro Tips

### For Maximum ATS Score

1. **Always Include Job Description**
   - Paste the full job posting
   - Get keyword analysis
   - See what keywords you're missing

2. **Use Quantifiable Metrics**
   - ❌ "Improved performance"
   - ✅ "Improved performance by 40%"
   
3. **Include Relevant Skills**
   - Match technologies from job description
   - Add both technical and soft skills

4. **Strong Action Verbs**
   - Led, Developed, Implemented, Achieved
   - Not: Worked on, Helped with, Responsible for

---

## 📊 Understanding Your ATS Score

| Score | Meaning | Action |
|-------|---------|--------|
| 85-100% | **Excellent** | Ready to apply! |
| 70-84% | **Good** | Minor improvements needed |
| 50-69% | **Fair** | Add missing keywords |
| 0-49% | **Needs Work** | Review suggestions |

---

## 🔧 API Rate Limits

- **5 resumes per hour** per IP address
- Resets every 60 minutes
- Headers show remaining requests

---

## 📁 File Structure

```
harvard-ats-resume/
├── app/
│   ├── api/generate-resume/    # API endpoint
│   ├── page.tsx                # Main page
│   └── layout.tsx              # SEO & layout
├── components/
│   ├── ResumeForm.tsx          # Multi-step form
│   └── ResumeResults.tsx       # Results display
├── lib/
│   ├── schemas.ts              # Validation
│   ├── gemini.ts               # AI integration
│   ├── ats-scoring.ts          # Scoring algorithm
│   └── rate-limit.ts           # Rate limiting
└── README.md                   # Full documentation
```

---

## 🐛 Troubleshooting

### Issue: "GEMINI_API_KEY is not configured"
**Solution**: Make sure you created `.env` file with your API key

### Issue: Rate limit exceeded
**Solution**: Wait 60 minutes or use different IP

### Issue: Low ATS score
**Solution**: 
1. Add job description
2. Include more relevant keywords
3. Use quantifiable achievements

### Issue: PDF not generating
**Solution**: Check browser console for errors, try different browser

---

## 🚀 Deployment to Production

### Deploy to Vercel (Easiest)

```bash
# 1. Push to GitHub
git init
git add .
git commit -m "Initial commit"
git push

# 2. Go to vercel.com
# 3. Import repository
# 4. Add environment variable: GEMINI_API_KEY
# 5. Deploy!
```

---

## 📚 Additional Resources

- **Full README**: See README.md for complete documentation
- **API Docs**: See API endpoint structure
- **Product Spec**: See product requirements

---

## ✨ Key Features Summary

1. ✅ **Guided Multi-Step Form**
2. ✅ **AI Enhancement** (Gemini)
3. ✅ **ATS Scoring** (Algorithm-based)
4. ✅ **Keyword Analysis** (Matched/Missing)
5. ✅ **Harvard Format** (Professional)
6. ✅ **PDF Export** (ATS-compatible)
7. ✅ **No Fabrication** (Only enhancement)
8. ✅ **Security** (Rate limiting, validation)

---

## 🎯 What Makes This Different?

### NOT a Generic Resume Builder

**Unique Features:**
- 🎯 Job description alignment
- 📊 Real ATS score (algorithmic, not guessed)
- 🔍 Keyword gap analysis
- ✅ No hallucinated experience
- 🎓 Harvard Business School format
- 💡 Actionable suggestions

---

## 💻 Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Forms**: React Hook Form
- **Validation**: Zod
- **AI**: Google Gemini
- **PDF**: jsPDF

---

## 📞 Need Help?

1. Check README.md for detailed documentation
2. Review error messages in browser console
3. Test with sample data first
4. Verify API key is correct

---

**You're all set! 🎉**

Start building your ATS-optimized resume now!

---

**Quick Command Reference:**
```bash
npm install          # Install dependencies
npm run dev          # Start development server
npm run build        # Build for production
npm start            # Run production server
```
