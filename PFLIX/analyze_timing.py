import re

# Read and extract BFLIX lines
with open('/Users/gaia/ABC FLIX/PFLIX/films.md') as f:
    raw = f.read()

valid = {'CLR','PNT','LIN','REC','SHF','C'}
lines = []
for line in raw.split('\n'):
    t = line.strip()
    if not t: continue
    cmd = t.split()[0].upper()
    if cmd in valid:
        lines.append(t)

# Analyze sections
fps = 12
sections = []
cur_section = None
cur_frames = 0
cur_comments = []
title_frames = 0
hold_default = 24
trans_default = 6

for line in lines:
    parts = line.split()
    cmd = parts[0].upper()
    
    if cmd == 'C':
        txt = line[2:].strip() if len(line) > 2 else ''
        if not txt or txt.startswith('═') or txt.startswith('---'):
            continue
        upper = txt.upper()
        
        if re.match(r'STATE\s*0?1\s', upper):
            if cur_section:
                sections.append({
                    'title': cur_section,
                    'anim_frames': cur_frames,
                    'title_frames': title_frames,
                    'comments': cur_comments
                })
            cur_section = txt
            cur_frames = 0
            cur_comments = [txt]
            title_frames = trans_default + hold_default
        else:
            cur_comments.append(txt)
            if re.match(r'RESOLVE', upper):
                title_frames += trans_default + int(hold_default * 1.3)

    elif cmd == 'REC':
        try:
            n = int(parts[1]) if len(parts) > 1 else 1
            cur_frames += min(n, 5000)
        except ValueError:
            cur_frames += 1
    elif cmd == 'SHF':
        try:
            n = int(parts[3]) if len(parts) > 3 else 1
            cur_frames += min(n, 5000)
        except (ValueError, IndexError):
            cur_frames += 1

if cur_section:
    sections.append({
        'title': cur_section,
        'anim_frames': cur_frames,
        'title_frames': title_frames,
        'comments': cur_comments
    })

# Print analysis
total_frames = 0
hdr = "{:>3} | {:50} | {:>6} | {:>6} | {:>6} | {:>8}".format(
    '#', 'CHAPTER', 'ANIM', 'TITLE', 'TOTAL', 'TIME')
print("FPS:", fps)
print()
print(hdr)
print('-' * 95)

cumulative = 0
section_data = []

for i, s in enumerate(sections):
    total = s['anim_frames'] + s['title_frames']
    total_frames += total
    secs = total / fps
    start_time = cumulative / fps
    cumulative += total
    
    if secs >= 60:
        mins = int(secs // 60)
        remainder = secs % 60
        time_str = "{}:{:05.2f}".format(mins, remainder)
    else:
        time_str = "{:.1f}s".format(secs)
    
    title = s['title'][:50]
    row = "{:3} | {:50} | {:6} | {:6} | {:6} | {:>8}".format(
        i+1, title, s['anim_frames'], s['title_frames'], total, time_str)
    print(row)
    
    section_data.append({
        'idx': i+1,
        'start': start_time,
        'duration': secs,
        'comments': s['comments']
    })

print('-' * 95)
anim_total = sum(s['anim_frames'] for s in sections)
title_total = sum(s['title_frames'] for s in sections)
total_secs = total_frames / fps
total_mins = int(total_secs // 60)
total_rem = total_secs % 60
row = "    | {:50} | {:6} | {:6} | {:6} | {}:{:05.2f}".format(
    'TOTAL', anim_total, title_total, total_frames, total_mins, total_rem)
print(row)
print()

# Print C comments per section for voiceover
print('=' * 80)
print('VOICEOVER MATERIAL — C COMMENTS PER SECTION')
print('=' * 80)
for sd in section_data:
    start = sd['start']
    dur = sd['duration']
    sm = int(start // 60)
    ss = start % 60
    print()
    print("-- CH {:02d} | {:02d}:{:05.2f} - {:.1f}s --".format(
        sd['idx'], sm, ss, dur))
    for c in sd['comments']:
        print("  " + c)
