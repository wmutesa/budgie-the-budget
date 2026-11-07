// Made-up digest editions for the browser test and screenshots: plenty of
// stories, deadlines and drafts, with dates relative to today. Nothing here is
// about a real person.
const inDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const ago = n => new Date(Date.now() - n * 864e5).toISOString();
const day = n => new Date(Date.now() + n * 864e5).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const story = (tag, headline, desc, fit, due, score, link, extra = {}) => ({
  tag, headline, desc, fit, score, ctaLink: `https://example.org/${link}`, source: 'example.org', date: ago(Math.abs(due ?? 3) % 5),
  ...(due === null ? { deadline: 'Rolling', dueIso: '' } : { deadline: `${tag === 'EVENT' ? 'On' : 'Apply by'} ${day(due)}`, dueIso: inDays(due) }),
  ctaLabel: { INTERNSHIP: 'Apply', PROGRAM: 'Read and apply', EVENT: 'Register', PERK: 'Claim it', AMBASSADOR: 'Apply', RESEARCH: 'Read the project' }[tag],
  ...extra,
});

function sampleEdition({ id = inDays(0), createdAt = new Date().toISOString(), edition = 'Saturday Edition', dateLong = 'Saturday, November 7, 2026' } = {}) {
  const stories = [
    story('EVENT', 'Student hackathon this month', 'A free weekend hackathon, online and in Boston, with tracks for hardware, climate and health.', 'Matches robotics; open to all years', 4, 88, 'hack'),
    story('INTERNSHIP', 'Embedded systems intern, summer', 'A hardware startup is hiring two interns to work on firmware for low-power sensors.', 'Matches embedded systems; first-years welcome', 9, 92, 'embedded-intern', { fromAI: true }),
    story('PROGRAM', 'First-year engineering fellowship', 'A ten-week paid fellowship pairing first-year students with engineers at partner companies.', 'Open to international students; no coursework needed', 12, 84, 'fellowship'),
    story('RESEARCH', 'Undergraduate research in solar microgrids', 'A campus lab is looking for students to help test small solar systems for rural clinics.', 'Matches energy; ask about first-year roles', 6, 79, 'microgrids'),
    story('PERK', 'Free cloud credits for student projects', 'Students can claim credits for hosting and machine learning, renewed every year.', 'Check eligibility on the page', null, 61, 'credits'),
    story('AMBASSADOR', 'Campus ambassador program opens', 'Represent a developer tools company on campus: run events, get swag and a stipend.', 'Open to all years; one hour a week', 2, 70, 'ambassador'),
    story('INTERNSHIP', 'Remote software internship for students abroad', 'A remote-first company hires students in any time zone for a 12-week summer internship.', 'Remote; may need US work authorisation: check eligibility', 13, 66, 'remote-intern'),
    story('EVENT', 'Robotics club demo night', 'Clubs show what they built this semester; good for meeting teams who need members.', 'Matches robotics', 1, 74, 'demo-night'),
    story('PROGRAM', 'Open source mentorship, spring cohort', 'Paid mentorship for students contributing to open source projects for twelve weeks.', 'Matches embedded systems; stipend', 0, 81, 'mentorship', { fromAI: true }),
    story('RESEARCH', 'Robot hand dexterity study needs helpers', 'A robotics group is recruiting undergraduates to run experiments and label data.', 'Matches robotics; 6 hours a week', -1, 58, 'dexterity'),
  ];
  return {
    id, createdAt, edition, dateLong, stream: 'main', name: 'My brief', provider: 'Gemini with Google Search and free sources', topics: ['robotics', 'embedded', 'energy'],
    preheader: `${stories.length + 1} new finds, 6 deadlines in the next two weeks.`,
    lead: { kicker: 'Research · Apply by Dec 1', headline: 'Robotics lab opens first-year research roles', dek: 'Undergraduates can join a robotics lab this spring, no experience needed.', body: 'The lab builds low-cost robots for schools and clinics and is taking four first-year students for the spring. Students learn soldering, firmware and testing, and can stay on paid in the summer.', ctaLabel: 'Apply', ctaLink: 'https://example.org/lab', link2Label: 'More like this', link2: 'https://news.google.com/search?q=robotics' },
    stories,
    deadlines: stories.filter(s => s.dueIso && s.dueIso >= inDays(0) && s.dueIso <= inDays(14)).map(s => ({ date: s.dueIso, name: s.headline, desc: `${s.tag.charAt(0)}${s.tag.slice(1).toLowerCase()} · example.org`, ctaLabel: s.ctaLabel, ctaLink: s.ctaLink })),
    drafts: [
      { no: '1', to: 'Robotics Lab', purpose: 'Ask about first-year research roles', status: 'Needs a contact', sendBy: `by ${day(5)}`, subject: 'First-year student interested in your robotics research', body: 'Hello,\n\nI am a first-year student interested in robotics and low-cost hardware. I read about your lab\'s work on robots for schools and would love to learn how first-year students can help.\n\nCould we have a 15-minute call in the next two weeks?\n\nThank you for your time,\nSam' },
      { no: '2', to: 'Fellowship team', purpose: 'Ask whether international students qualify', status: 'Ready to send', sendBy: `by ${day(8)}`, subject: 'Question about eligibility for the fellowship', body: 'Hello,\n\nI am a first-year engineering student and an international student. Is the fellowship open to students in my situation, and are there any course requirements?\n\nThank you for your time,\nSam' },
      { no: '3', to: 'Hackathon organisers', purpose: 'Ask about hardware kits', status: 'Follow-up due', sendBy: `was ${day(-2)}`, subject: 'Hardware kits at the hackathon', body: 'Hello,\n\nWill there be hardware kits at the hackathon, or should teams bring their own boards?\n\nThank you for your time,\nSam' },
    ],
    watch: { topic: 'student visa', headline: 'New guidance on student work rules', body: 'Officials published new guidance on when students can work off campus during their first year. Schools are expected to update their advice next month.', linkLabel: 'Read it', link: 'https://example.org/visa', note: 'Not legal advice.' },
    action: { text: 'Register: Student hackathon this month (on ' + day(4) + ').', label: 'Register', link: 'https://example.org/hack' },
    sources: [{ title: 'example.org', url: 'https://example.org/lab' }, { title: 'Google News', url: 'https://news.google.com' }, { title: 'Gemini with Google Search', url: 'https://example.org/research' }],
  };
}
// Two older editions, so the edition timeline has something to show.
const olderEditions = () => [
  { ...sampleEdition({ id: inDays(-2), createdAt: ago(2), edition: 'Thursday Edition', dateLong: 'Thursday, November 5, 2026' }), lead: { ...sampleEdition().lead, headline: 'Spring research positions open across campus' } },
  { ...sampleEdition({ id: inDays(-5), createdAt: ago(5), edition: 'Monday Edition', dateLong: 'Monday, November 2, 2026' }), lead: { ...sampleEdition().lead, headline: 'Ten programs that welcome first-year engineers' } },
];

module.exports = { sampleEdition, olderEditions, inDays };
