# AI Harvard ATS Resume Builder

**AI-Powered ATS-Optimized Harvard-Style Resume Builder for Tech Professionals**

Build professional resumes that pass Applicant Tracking Systems (ATS) with AI-powered keyword matching, scoring analysis, and Harvard Business School formatting guidelines.

---

## 🎯 Product Vision

This application helps you:
- ✅ Collect structured professional data through a guided form
- ✅ Generate Harvard-style resumes with AI enhancement
- ✅ Optimize content for ATS systems
- ✅ Align your resume with specific job descriptions
- ✅ Get keyword match analysis and ATS scoring
- ✅ Export clean, professional PDFs

**Core Principle:** The system **NEVER** fabricates experience or invents metrics - it only restructures and optimizes your provided data.

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ installed
- Google Gemini API key ([Get FREE key here](https://makersuite.google.com/app/apikey))

### Installation

```bash
# Navigate to project directory
cd harvard-ats-resume

# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY

# Run development server
npm run dev
```

### Open Browser
Navigate to [http://localhost:3000](http://localhost:3000)

---

## ✨ Key Features

### 1. **Guided Multi-Step Form**
- Personal Information
- Professional Summary
- Work Experience (with quantifiable achievements)
- Education
- Skills (Hard & Soft)
- Job Description (Optional but recommended)

### 2. **🎓 Certificate Upload with OCR** (NEW!)
- Upload diploma or certificate images
- Automatic text extraction using Tesseract.js OCR
- Auto-populate education fields (degree, institution, dates, GPA, honors)
- Supports PNG, JPG, GIF, PDF, and other image formats
- Client-side processing (privacy-first, no server uploads)
- See [certificates/README.md](./certificates/README.md) for details

### 3. **AI-Powered Enhancement** (Google Gemini)
- Restructures content for clarity
- Uses strong action verbs
- Maintains Harvard format
- Integrates job description keywords naturally
- **Never invents or fabricates information**

### 4. **ATS Scoring Algorithm** (Server-Side)
- Extracts keywords from job description
- Matches against resume content
- Calculates percentage-based score
- Shows matched and missing keywords
- Provides actionable suggestions

### 5. **Professional Output**
- Harvard Business School format
- ATS-compatible formatting
- 1-page optimized
- Clean PDF export
- Print-ready layout

---

## 🏗️ Technical Architecture

```
User Input (React Hook Form)
       ↓
POST /api/generate-resume
       ↓
Zod Schema Validation
       ↓
Rate Limiting (5 req/hour)
       ↓
Input Sanitization
       ↓
Gemini AI Enhancement
       ↓
ATS Keyword Extraction
       ↓
Score Calculation
       ↓
Response: {
  formattedResume,
  atsScore,
  matchedKeywords,
  missingKeywords,
  suggestions
}
```

---

## 📁 Project Structure

```
harvard-ats-resume/
├── app/
│   ├── api/generate-resume/
│   │   └── route.ts          # Main API endpoint
│   ├── layout.tsx            # Root layout with SEO
│   ├── page.tsx              # Main page component
│   └── globals.css           # Global styles
├── components/
│   ├── ResumeForm.tsx        # Guided form (React Hook Form)
│   ├── ResumeResults.tsx     # Results display with ATS score
│   ├── CertificateUpload.tsx # OCR certificate upload component
│   └── VoiceInput.tsx        # Voice input component
├── lib/
│   ├── schemas.ts            # Zod validation schemas
│   ├── gemini.ts             # Gemini AI integration
│   ├── ats-scoring.ts        # ATS algorithm (keyword extraction)
│   └── rate-limit.ts         # Rate limiting utility
├── certificates/
│   ├── README.md             # Certificate upload documentation
│   ├── .gitignore            # Protect privacy of uploaded images
│   └── localhost.pem         # SSL certificates for HTTPS
├── package.json
├── tsconfig.json
├── tailwind.config.js
└── next.config.js            # Security headers
```

---

## 🔒 Security Features

### Input Validation
- ✅ Zod schema validation on all inputs
- ✅ Type safety with TypeScript
- ✅ Length limits on all fields
- ✅ Email/URL format validation

### API Security
- ✅ Rate limiting (5 requests per hour)
- ✅ Input sanitization (XSS prevention)
- ✅ HTTP method restrictions (POST only)
- ✅ Environment variable protection

### Security Headers
- ✅ Strict-Transport-Security
- ✅ X-Frame-Options: SAMEORIGIN
- ✅ X-Content-Type-Options: nosniff
- ✅ X-XSS-Protection

---

## 📊 ATS Scoring Algorithm

The ATS score is calculated **server-side** (not by AI) using the following algorithm:

### Step 1: Extract Keywords from Job Description
```typescript
- Tokenize text
- Remove stopwords
- Filter technical terms and nouns
- Identify multi-word terms (e.g., "machine learning")
- Count frequency
```

### Step 2: Match Against Resume
```typescript
- Check if keywords appear in resume text
- Check if keywords appear in skills array
- Count matches
```

### Step 3: Calculate Score
```typescript
atsScore = (matched_keywords / total_keywords) * 100
```

### Result
```typescript
{
  atsScore: 84,
  matchedKeywords: ["React", "Node.js", "AWS"],
  missingKeywords: ["GraphQL", "Docker"],
  suggestions: [...]
}
```

---

## 🎨 Harvard Resume Format

The AI generates resumes in Harvard Business School format:

```
FULL NAME
Location | Email | LinkedIn | GitHub

PROFESSIONAL SUMMARY
[2-3 sentences highlighting key qualifications]

EXPERIENCE
Company Name — Role Title
Start Date - End Date
• Led team of X engineers, achieving Y% improvement in Z metric
• Developed feature that increased user engagement by X%
• Implemented system reducing costs by $X annually

EDUCATION
Institution Name
Degree, Start Date - End Date

SKILLS
Technical Skills: React, Python, AWS, Docker
Soft Skills: Leadership, Communication
```

---

## 🔧 API Documentation

### POST /api/generate-resume

**Request Body:**
```json
{
  "personalInfo": {
    "fullName": "string",
    "location": "string",
    "email": "string",
    "linkedin": "string",
    "github": "string"
  },
  "summary": "string",
  "experience": [
    {
      "company": "string",
      "role": "string",
      "startDate": "string",
      "endDate": "string",
      "description": "string",
      "technologies": ["string"]
    }
  ],
  "education": [
    {
      "institution": "string",
      "degree": "string",
      "startDate": "string",
      "endDate": "string"
    }
  ],
  "skills": {
    "hardSkills": ["string"],
    "softSkills": ["string"]
  },
  "jobDescription": "string | null"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "formattedResume": "string",
    "atsScore": 84,
    "matchedKeywords": ["React", "Node.js"],
    "missingKeywords": ["GraphQL"],
    "suggestions": ["Add measurable achievements..."]
  }
}
```

**Rate Limit (429):**
```json
{
  "success": false,
  "error": "Rate limit exceeded...",
  "retryAfter": "2024-02-16T10:30:00.000Z"
}
```

---

## 🎯 Target Audience

- 🎓 University students
- 💻 Junior developers
- 🚀 Tech professionals
- 🌍 International job applicants
- 🎖️ Bootcamp graduates

---

## 🆚 Differentiation

**This is NOT a generic resume builder.**

### Positioning
"AI ATS-Optimized Harvard Resume Builder for Tech Professionals"

### Key Differentiators
1. ✅ **OCR Certificate Upload** - Auto-fill education from diploma images
2. ✅ Job description alignment
3. ✅ Keyword gap detection
4. ✅ Real-time ATS score
5. ✅ Structured Harvard formatting
6. ✅ **No hallucinated experience** - only enhancement
7. ✅ Algorithm-based scoring (not AI guessing)
8. ✅ Voice input for faster data entry

---

## 📦 Deployment

### Vercel (Recommended)
```bash
# Push to GitHub
git init
git add .
git commit -m "Initial commit"
git push

# Deploy to Vercel
# 1. Import repository on vercel.com
# 2. Add GEMINI_API_KEY environment variable
# 3. Deploy!
```

### Environment Variables
```
GEMINI_API_KEY=your_production_key
NEXT_PUBLIC_APP_URL=https://yourdomain.com
```

---

## 🧪 Testing

### Manual Testing
```bash
# Test API endpoint
curl -X POST http://localhost:3000/api/generate-resume \
  -H "Content-Type: application/json" \
  -d @test-data.json
```

### Test Rate Limiting
```bash
# Make 6 requests quickly (5th should work, 6th should be rate limited)
for i in {1..6}; do
  echo "Request $i"
  curl -X POST http://localhost:3000/api/generate-resume \
    -H "Content-Type: application/json" \
    -d @test-data.json
done
```

---

## 💡 Usage Tips

### For Best Results

1. **Be Specific**: Provide detailed achievements with metrics
   - ❌ "Worked on backend"
   - ✅ "Developed REST API handling 10,000+ requests/day, reducing latency by 40%"

2. **Use Numbers**: Quantify your impact
   - Team size (Led 5 engineers)
   - Percentages (Increased by 30%)
   - Dollar amounts (Saved $200K annually)

3. **Include Job Description**: Always paste the job posting
   - Gets keyword analysis
   - Receives ATS score
   - Gets targeted suggestions

4. **List Relevant Skills**: Focus on job-specific technical skills
   - Match technologies from job description
   - Include proficiency levels if relevant

---

## 🗺️ Roadmap

### Phase 1 (MVP) ✅
- [x] Guided form with validation
- [x] Resume generation with Gemini AI
- [x] ATS scoring algorithm
- [x] Keyword matching analysis
- [x] PDF export
- [x] Rate limiting
- [x] **OCR Certificate Upload** (NEW!)
- [x] Voice input for text fields

### Phase 2 (Planned)
- [ ] User authentication (Clerk)
- [ ] Draft saving (MongoDB)
- [ ] Resume versioning (per job)
- [ ] Cover letter generator
- [ ] Resume templates (multiple styles)
- [ ] A/B testing different versions

### Phase 3 (Future)
- [ ] SaaS model with Stripe
- [ ] Resume analytics dashboard
- [ ] LinkedIn profile import
- [ ] Job matching recommendations

---

## 🤝 Contributing

We welcome contributions! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

---

## 📝 License

MIT License - feel free to use for personal and commercial projects.

---

## 🙏 Acknowledgments

- **Google Gemini**: AI-powered content enhancement
- **Tesseract.js**: OCR for certificate text extraction
- **Next.js**: React framework
- **React Hook Form**: Form state management
- **Zod**: Runtime validation
- **Harvard Business School**: Resume format inspiration

---

## 📞 Support

For support or questions:
- 📧 Open an issue on GitHub
- 📚 Check documentation
- 💬 Discussion forum

---

**Built with ❤️ for job seekers worldwide**

*Empowering candidates with AI-powered professional resumes that pass ATS systems*

---

## Quick Links

- 🚀 [Live Demo](#) (Coming soon)
- 📖 [Full Documentation](#)
- 🔒 [Security Policy](#)
- 🐛 [Report Bug](#)
- 💡 [Request Feature](#)

---

**Last Updated**: February 2024  
**Version**: 1.0.0 (MVP)  
**Status**: Production Ready ✅
