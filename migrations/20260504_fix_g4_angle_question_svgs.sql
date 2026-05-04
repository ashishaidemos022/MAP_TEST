-- Fix two G4 math angle questions whose SVG figures didn't match the answer.
-- Already applied 2026-05-04 via service-role direct UPDATE (kid hit them in
-- a live test); this file exists for audit / replay parity.
--
-- Q1 (id 6a97746c…) — "What is the measure of the angle shown on the protractor below?"
--   Original SVG had one ray at the 180° tick and the other at the 20° tick.
--   Mathematically the protractor sweep from 180 to 20 reads 160° (correct
--   answer), BUT the visual gap between the two arrows looks like a tight
--   acute 20° angle, so a Grade 4 student naturally reads "20°" off the
--   picture. Replaced with the rays at 0° and 160° instead — same answer,
--   but the protractor sweep is unambiguously the 160° arc.
--
-- Q2 (id e1c08358…) — "What kind of angle is shown below?"  (answer: Obtuse)
--   Original SVG drew a horizontal line with arrows on BOTH ends (i.e., a
--   straight line / 180°) plus a disconnected quarter-arc floating above.
--   No vertex, no two rays — fundamentally broken. Replaced with a proper
--   two-ray angle: one ray right-horizontal, one ray up-and-left at ~130°,
--   with a small arc indicator marking the angle at the vertex.

UPDATE public.map_questions
SET stem_image_svg = $svg$<svg width='240' height='135' xmlns='http://www.w3.org/2000/svg'><path d='M 30 110 A 90 90 0 0 1 210 110' fill='#d9f0f5' stroke='#1c6378' stroke-width='1.5'/><line x1='30' y1='110' x2='210' y2='110' stroke='#1c6378' stroke-width='1.5'/><text x='120' y='16' text-anchor='middle' font-family='sans-serif' font-size='9' fill='#1c6378'>90</text><text x='22' y='125' text-anchor='middle' font-family='sans-serif' font-size='9' fill='#1c6378'>0</text><text x='218' y='125' text-anchor='middle' font-family='sans-serif' font-size='9' fill='#1c6378'>180</text><line x1='120' y1='110' x2='30' y2='110' stroke='#222' stroke-width='2'/><polygon points='30,110 38,107 38,113' fill='#222'/><line x1='120' y1='110' x2='203' y2='80' stroke='#222' stroke-width='2'/><polygon points='203,80 197,87 194,79' fill='#222'/><circle cx='120' cy='110' r='2.5' fill='#222'/></svg>$svg$
WHERE id = '6a97746c-3dc8-41f2-9f1e-04e6f0871dcc';

UPDATE public.map_questions
SET stem_image_svg = $svg$<svg width='220' height='120' xmlns='http://www.w3.org/2000/svg'><line x1='110' y1='95' x2='200' y2='95' stroke='#222' stroke-width='2'/><polygon points='200,95 192,91 192,99' fill='#222'/><line x1='110' y1='95' x2='52' y2='26' stroke='#222' stroke-width='2'/><polygon points='52,26 60,28 56,34' fill='#222'/><path d='M 130 95 A 20 20 0 0 1 97 80' fill='none' stroke='#444' stroke-width='1.2'/><circle cx='110' cy='95' r='2' fill='#222'/></svg>$svg$
WHERE id = 'e1c08358-9f6b-406e-965c-828af53ad8e1';
