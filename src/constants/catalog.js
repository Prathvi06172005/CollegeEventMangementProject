const EVENT_TAGS = [
  { value: 'tech', label: 'Tech & Coding' },
  { value: 'cultural', label: 'Cultural' },
  { value: 'sports', label: 'Sports' },
  { value: 'workshop', label: 'Workshop' },
];

const BRANCHES = [
  { value: 'cse', label: 'Computer Science' },
  { value: 'ece', label: 'Electronics & Communication' },
  { value: 'eee', label: 'Electrical & Electronics' },
  { value: 'me', label: 'Mechanical' },
  { value: 'ce', label: 'Civil' },
  { value: 'mba', label: 'MBA' },
];

const AUDIENCE_BRANCHES = [{ value: 'all', label: 'All Branches' }, ...BRANCHES];

module.exports = {
  EVENT_TAGS,
  BRANCHES,
  AUDIENCE_BRANCHES,
};



