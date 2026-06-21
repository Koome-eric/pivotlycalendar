const https = require('https');
https.get('https://marketplace.gohighlevel.com/docs/ghl/calendars/create-block-slot/', res => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    const lines = data.split(/\r?\n/).filter(l => /title|calendarId|assignedUserId|startTime|endTime|event|schema|Example|response/i.test(l));
    console.log(lines.slice(0,200).join('\n'));
  });
}).on('error', e => console.error(e));
