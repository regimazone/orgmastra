import { Breadcrumb, Crumb, Header, MainContentContent, MainContentLayout, Txt } from '@mastra/playground-ui';
import { useParams, Link } from 'react-router';
import { useScorer, useScoresByEntityId } from '@/hooks/use-scorers';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRightIcon, ChevronDownIcon, ChevronRightIcon, CodeIcon, EyeIcon, EyeOff, EyeOffIcon } from 'lucide-react';
import { format } from 'date-fns';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import * as Tabs from '@radix-ui/react-tabs';

function AgentScore({ score }: { score: any }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <article
      key={score.id}
      className={cn('border-b text-icon5 border-border1 last:border-b-0 text-[0.875rem]', {
        'bg-surface4': isExpanded,
      })}
    >
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn('grid w-full p-[1rem] px-[1.5rem] hover:bg-surface4', {
          //  'hover:bg-surface5': isExpanded,
        })}
      >
        <h3
          className={cn(
            'grid gap-[2rem] grid-cols-[8rem_7rem_1fr_2fr_5rem_auto] text-left [&>svg]:w-[1.2rem] [&>svg]:h-[1.2rem] [&>svg]:text-icon3',
            { '[&>svg]:rotate-180': isExpanded },
          )}
        >
          <span className="text-icon4">{score.id.split('-').pop()}</span>
          <span className="text-icon4">{format(new Date(score.createdAt), 'h:mm:ss bb')}</span>
          <span className="truncate pr-[1rem]">{score.result.input}</span>
          <span className="truncate pr-[1rem]">{score.result.output}</span>
          <span>{score.result.score}</span>
          <ChevronDownIcon />
        </h3>
      </button>
      {isExpanded && (
        <div className="m-[1.75rem] mt-0 border-t border-border1 pt-[1rem] text-icon4">
          <dl className="grid items-ce grid-cols-[8rem_1fr] gap-x-[2rem] gap-y-[1rem] [&>dt]:text-icon3 [&>dd]:max-w-[80ch] ">
            <dt>Input:</dt>
            <dd>{score.result.input}</dd>
            <dt>Output:</dt>
            <dd>{score.result.output}</dd>
            <dt>Score:</dt>
            <dd className="text-icon5 font-bold bg-surface5 justify-self-start p-[0.5rem] rounded-md px-[.75rem]">
              {score.result.score}
            </dd>
            <dt>Reason:</dt>
            <dd className="text-icon5">{score.result.reason}</dd>
          </dl>
        </div>
      )}

      {/* <div className="overflow-x-auto max-w-[60rem] border border-border1">
        <pre>{JSON.stringify(score, null, 2)}</pre>
      </div> */}
    </article>
  );
}

function AgentScores({ agentId }: { agentId: string }) {
  const { scores, isLoading } = useScoresByEntityId(agentId, 'AGENT');

  return scores?.scores.map(score => <AgentScore score={score} />);
}

export default function Scorer() {
  const { scorerId } = useParams();
  const { scorer, isLoading } = useScorer(scorerId!);
  const [visiblePrompt, setVisiblePrompt] = useState<string>('');

  const handlePromptChange = (prompt: string) => {
    if (prompt === visiblePrompt) {
      setVisiblePrompt('');
      return;
    }
    setVisiblePrompt(prompt);
  };

  if (isLoading) {
    return null;
  }

  return (
    <MainContentLayout>
      <Header>
        <Breadcrumb>
          <Crumb as={Link} to={`/mcps`}>
            Scorers
          </Crumb>

          <Crumb as={Link} to={`/scorers/${scorerId}`} isCurrent>
            {isLoading ? <Skeleton className="w-20 h-4" /> : scorer?.scorer.name || 'Not found'}
          </Crumb>
        </Breadcrumb>
      </Header>

      {scorer?.scorer ? (
        <MainContentContent
          className={cn('justify-center justify-items-center grid px-[2rem] relative', '3xl:grid-cols-[30rem_auto]')}
        >
          <div
            className={cn(
              'grid sticky z-[1] top-0 gap-y-[0.5rem] text-icon4 max-w-[80rem] w-[90%] mx-auto bg-surface2 py-[3rem]',
            )}
          >
            <h1 className="text-icon6 text-[1.5rem]">{scorer.scorer.name}</h1>
            <p className="m-0">{scorer.scorer.description}</p>
            <div
              className={cn(
                'flex gap-[1rem] mt-[1rem] text-[0.875rem] items-center',
                '[&>svg]:w-[1em] [&>svg]:h-[1em] [&>svg]:text-icon3',
              )}
            >
              <span>Sampling</span>
              <ArrowRightIcon />
              <div>
                Type: <b>{scorer?.sampling?.type}</b>
              </div>
              <span className="text-icon2 text-[0.75rem]">|</span>
              <div className="flex gap-[.25rem] ">
                Rate: <b>{scorer?.sampling?.type === 'ratio' ? scorer?.sampling?.rate : 'None'}</b>
              </div>
            </div>
            <Tabs.Root value={visiblePrompt} className="mt-[0.25rem]">
              <div
                className={cn(
                  'flex gap-[1rem] text-[0.875rem] items-center',
                  '[&>svg]:w-[1em] [&>svg]:h-[1em] [&>svg]:text-icon3',
                )}
              >
                <span>Prompts</span>
                <ArrowRightIcon />
                <div
                  className={cn(
                    'grid grid-cols-[1fr_1fr_1fr] items-center border border-b-0 border-border1 rounded-md',
                    '',
                  )}
                >
                  {Object.entries(scorer?.prompts || {}).map(([key]) => (
                    <button
                      onClick={() => handlePromptChange(key)}
                      className={cn(
                        'px-[1rem] py-[0.4rem] border capitalize font-semibold justify-center border-r border-border1 flex [&>svg]:text-icon3 [&>svg]:w-[1.5em] [&>svg]:h-[1.5em] items-center text-[0.8125rem]',
                        {
                          'bg-surface1 text-icon4 [&>svg]:w[1.1em] [&>svg]:h-[1.1em] pb-[0.6rem] ':
                            visiblePrompt === key,
                          'hover:bg-surface5 ': visiblePrompt !== key,
                        },
                      )}
                    >
                      {key}
                    </button>
                  ))}
                </div>
              </div>
              {Object.entries(scorer?.prompts || {}).map(([key, value]) => (
                <Tabs.Content value={key}>
                  <div className={`rounded-md border border-border1 bg-surface1 h-[20rem]  overflow-y-auto`}>
                    <pre className="text-[0.8125rem] text-[#ccc] p-[1rem] whitespace-pre-wrap font-mono ">
                      {value.prompt}
                    </pre>
                  </div>
                </Tabs.Content>
              ))}
            </Tabs.Root>
          </div>

          <div className="pt-[3rem] max-w-[80rem] w-[90%] mx-auto">
            <div
              className={cn(
                'grid gap-[2rem] px-[1.5rem] pb-[1rem] grid-cols-[8rem_7rem_1fr_2fr_5rem_auto] text-left text-[0.75rem] text-icon3 uppercase',
              )}
            >
              <span>id</span>
              <span>Created At</span>
              <span>Input</span>
              <span>Output</span>
              <span>Score</span>
              <span className="w-[1.5rem]"></span>
            </div>
            <div className="grid  border border-border1 bg-surface3 rounded-md ">
              {scorer?.agentIds.map((agentId: string) => (
                <AgentScores agentId={agentId} />
              ))}
            </div>
          </div>
        </MainContentContent>
      ) : null}
    </MainContentLayout>
  );
}

/*


<ul className="grid gap-[2rem]">
              {Object.entries(scorer?.prompts || {}).map(([key, value]) => (
                <li key={key}>
                  <Txt
                    as="h3"
                    variant="ui-md"
                    className="uppercase flex gap-3 [&>svg]:text-icon3 [&>svg]:w-[1.5em] [&>svg]:h-[1.5em] items-center"
                  >
                    <CodeIcon />
                    {key}
                  </Txt>

                  <div className={`rounded-md border bg-surface1 h-[20rem] overflow-y-auto`}>
                    <pre className="text-[0.75rem] text-icon5 p-[1rem] whitespace-pre-wrap font-mono ">
                      {value.prompt}
                    </pre>
                  </div>

               <CodeDisplay
                    content={value.prompt || ''}
                    // isCopied={isCopied}
                    // isDraft={!!enhancedPrompt}
                    // onCopy={() => currentContent && handleCopy()}
                    className="border-none bg-surface4 p-2 !h-[260px] max-w-[40rem]"
                  /> 

                 <ScrollArea className="h-[50vh]w-[60ch]">
                    <pre className="  bg-surface1 text-[0.75rem] text-icon5 border border-border1 p-[1rem]">
                      {value.prompt}
                    </pre>
                  </ScrollArea>
                </li>
              ))}
            </ul>


      <div>
        <div>
          Sampling Type: {scorer?.sampling?.type}
          Sampling Rate: {scorer?.sampling?.type === 'ratio' ? scorer?.sampling?.rate : 'None'}
        </div>
      </div>
      <div>
        <h2>Prompts</h2>
        <ul>
          {Object.entries(scorer?.prompts || {}).map(([key, value]) => (
            <li key={key}>
              <h2>{key}</h2>
              <p>{value.prompt}</p>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <ul>
          {scorer?.agentIds.map((agentId: string) => (
            <AgentScores agentId={agentId} />
          ))}
        </ul>
      </div>


      */
