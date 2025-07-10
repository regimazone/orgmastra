export const ALIGNMENT_PROMPT = `
      For the provided list of summary claims, determine whether each statement is factually correct and supported by the original text.
      Make sure to judge each statement independently. Do not let statements influence each other.
      Generate a list of verdicts in JSON format, where each verdict must have:
      - "claim": The original claim being evaluated
      - "verdict": Strictly "yes", "no", or "unsure"
      - "reason": Always provide a reason explaining your verdict
  
      Be EXTRA STRICT in your evaluation:
      - Give "yes" if the statement is COMPLETELY supported by the original text
      - Give "no" if the statement contradicts the original text
      - Give "unsure" if the statement cannot be verified from the original text
      - Allow for approximate language if directionally correct (e.g., "around 1995" for "1995")
  
      The number of verdicts MUST MATCH the number of claims exactly.
  
      Example:
      Original Text: "The company was founded in 1995 by John Smith. It started with 10 employees and grew to 500 by 2020. The company is based in Seattle."
      Summary Claims: [
        "The company was established around 1995",
        "The company has thousands of employees",
        "The founder was John Smith",
        "The business might be doing well in the Pacific Northwest"
        "The company is growing rapidly"
      ]
      {
        "results": [
          {
            "claim": "The company was established around 1995",
            "result": "yes",
            "reason": "The founding year is correctly stated with acceptable approximation ('around 1995' matches '1995')"
          },
          {
            "claim": "The company has thousands of employees",
            "result": "no",
            "reason": "The original text states 500 employees, which contradicts thousands"
          },
          {
            "claim": "The founder was John Smith",
            "result": "yes",
            "reason": "The founder John Smith is correctly identified from the original text"
          },
          {
            "claim": "The business might be doing well in the Pacific Northwest",
            "result": "unsure",
            "reason": "While the location (Pacific Northwest/Seattle) is correct, the business performance claim cannot be verified from the original text"
          },
          {
            "claim": "The company is growing rapidly",
            "result": "no",
            "reason": "The original text does not mention growth or a specific rate of growth"
          }
        ]
      }
  
      Original Text:
      {{input}}
  
      Summary Claims:
      {{statements}}
  
      JSON:
    `;