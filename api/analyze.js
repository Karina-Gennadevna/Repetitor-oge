export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { questions, answers, score, total } = req.body;

  if (!questions || !answers) {
    return res.status(400).json({ error: 'Missing data' });
  }

  const mistakes = questions
    .map((q, i) => ({ q, i, given: answers[i] }))
    .filter(({ q, given }) => given !== null && given !== undefined && given !== q.correct);

  const correctCount = answers.filter((a, i) => a === questions[i].correct).length;
  const skipped = answers.filter(a => a === null || a === undefined).length;

  const mistakesText = mistakes.map(({ q, i, given }) => {
    const letters = ['А', 'Б', 'В', 'Г'];
    return `Задание ${i + 1} (тема: ${q.tag}):
Вопрос: ${q.text.replace(/<[^>]+>/g, '')}
Ученик ответил: ${letters[given]} — ${q.options[given]}
Правильный ответ: ${letters[q.correct]} — ${q.options[q.correct]}`;
  }).join('\n\n');

  const prompt = `Ты — опытный репетитор по математике, готовишь учеников к ОГЭ по стандартам ФИПИ.

Ученик прошёл пробный экзамен. Результат: ${correctCount} из ${total} верно${skipped > 0 ? `, ${skipped} пропущено` : ''}.

${mistakes.length > 0 ? `Ошибки:\n\n${mistakesText}` : 'Все задания выполнены верно!'}

Напиши разбор в формате JSON (без markdown, только чистый JSON):
{
  "summary": "2-3 предложения: общая оценка результата, честно и по-дружески",
  "mistakes": [
    {
      "topic": "название темы",
      "what_went_wrong": "в чём конкретно ошибка, 1-2 предложения",
      "how_to_fix": "как правильно решать такие задания, 1-2 предложения",
      "lost_points": "сколько баллов потерял и как их вернуть"
    }
  ],
  "plan": [
    {
      "priority": 1,
      "topic": "тема",
      "reason": "почему эта тема важна",
      "action": "что конкретно сделать"
    }
  ],
  "motivation": "1 предложение — личный совет ученику что сделать прямо сейчас"
}

Если ошибок нет — массив mistakes пустой, план короткий (поддержать темп).
Отвечай только JSON, без пояснений вокруг.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Anthropic error:', err);
      return res.status(502).json({ error: 'AI unavailable' });
    }

    const data = await response.json();
    const text = data.content[0].text.trim();

    let analysis;
    try {
      analysis = JSON.parse(text);
    } catch {
      // Попробуем вырезать JSON из текста
      const match = text.match(/\{[\s\S]*\}/);
      analysis = match ? JSON.parse(match[0]) : null;
    }

    if (!analysis) {
      return res.status(502).json({ error: 'Invalid AI response' });
    }

    return res.status(200).json(analysis);
  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
