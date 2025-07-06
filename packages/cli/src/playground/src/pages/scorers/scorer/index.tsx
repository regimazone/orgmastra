import { Breadcrumb, Crumb, Header, MainContentContent, MainContentLayout } from '@mastra/playground-ui';
import { useParams, Link } from 'react-router';
import { useScorer, useScoresByEntityId } from '@/hooks/use-scorers';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowDownIcon,
  ArrowRightIcon,
  ChevronDownIcon,
  ExpandIcon,
  EyeIcon,
  RectangleEllipsisIcon,
  XCircleIcon,
  XIcon,
} from 'lucide-react';
import { format } from 'date-fns';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import * as Tabs from '@radix-ui/react-tabs';

import * as Dialog from '@radix-ui/react-dialog';

import MarkdownRenderer from '@/components/ui/markdown-renderer';

function AgentScore({ score }: { score: any }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  return (
    <>
      <article
        key={score.id}
        className={cn('scoreListItem border-b text-icon5 border-border1 last:border-b-0 text-[0.875rem]', {
          'expanded rounded-[0.75rem] shadow-[inset_0_0_0_2px_#2e2e2ee6] bg-surface4': isExpanded,
        })}
        // style={{ boxShadow: `inset 5em 1em gold` }}
      >
        <div
          className={cn('grid', {
            'grid-cols-[1fr_4rem]': isExpanded,
            'grid-cols-[1fr]': !isExpanded,
          })}
        >
          <button onClick={() => setIsExpanded(!isExpanded)} className={cn('grid w-full  px-[1.5rem] ', {})}>
            <div
              className={cn(
                'grid gap-[1rem] text-left items-center min-h-[4rem] grid-cols-[8rem_6rem_1fr_1fr_3rem_5rem] ',
                '[&>svg]:w-[1.2rem] [&>svg]:h-[1.2rem] [&>svg]:text-icon3',
                { '[&>svg]:rotate-180 grid-cols-[8rem_6rem_1fr_1fr_3rem_1rem]': isExpanded },
              )}
            >
              <span className="text-icon4">{score.id.split('-').pop()}</span>
              <span className="text-icon4">{format(new Date(score.createdAt), 'h:mm:ss bb')}</span>
              <span className="truncate pr-[1rem]">{score.result.input}</span>
              <span className="truncate pr-[1rem]">{score.result.output}</span>
              <span>{score.result.score}</span>
              <ChevronDownIcon className="justify-self-end" />
            </div>
          </button>

          {isExpanded && (
            <button
              onClick={() => setIsDialogOpen(true)}
              className="flex items-center justify-center bg-surface5 rounded-md"
            >
              <EyeIcon />
            </button>
          )}
        </div>
        {isExpanded && (
          <div className="leading-[1.5] m-[1.75rem] mt-0 border-t border-border1 pt-[1rem] text-icon4">
            <dl className="grid  grid-cols-[7rem_1fr] gap-x-[2rem] gap-y-[1rem] [&>dt]:text-icon3 [&>dd]:max-w-[80ch] ">
              <dt>Input:</dt>

              <dd>
                {score.result.output.length > 200 ? (
                  <>{score.result.input.substring(0, 200)} [...]</>
                ) : (
                  score.result.input
                )}
              </dd>
              <dt>Output:</dt>
              <dd>
                {score.result.output.length > 200 ? (
                  <>{score.result.output.substring(0, 200)} [...]</>
                ) : (
                  score.result.output
                )}
              </dd>
              <dt>Score:</dt>
              <dd className="text-icon5 font-bold bg-surface5 justify-self-start p-[0.5rem] rounded-md px-[.75rem]">
                {score.result.score}
              </dd>
              <dt>Reason:</dt>
              <dd className="text-icon5">{score.result.reason}</dd>
            </dl>
          </div>
        )}
      </article>

      <Dialog.Root open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="bg-black top-0 bottom-0 right-0 left-0 fixed z-[10] opacity-[0.65]" />
          <Dialog.Content
            className={cn(
              'overflow-y-scroll text-[0.875rem] text-icon4 w-[80%] fixed transform: left-1/2 top-0 bottom-0 max-w-[60rem] -translate-x-1/2 z-[10] bg-transparent flex items-start focus:outline-none p-0',
            )}
          >
            <div
              className={cn(
                'border border-border1 bg-surface4 content-start rounded-[.5rem]',
                '[&>section]:grid [&>section]:gap-[1rem]',
                '[&_h2]:text-icon5 [&_h2]:text-[1rem] [&_h2]:font-semibold [&_h2]:mb-0',
                'mt-auto mb-auto',
                'grid grid-rows-[auto_1fr] max-h-[85vh]',
              )}
            >
              <div className="bg-surface4 border-b border-border1 flex items-center p-[2rem]">
                <h2 className=" w-full !text-[0.875rem] !text-icon3 !font-normal flex items-center gap-[1rem]">
                  <span>{score.id}</span>|<span>{format(new Date(score.createdAt), 'h:mm:ss bb')}</span>
                </h2>
                <Dialog.Close asChild>
                  <button
                    className="inline-flex bg-surface5 appearance-none items-center justify-center rounded-md p-[.2rem] focus:shadow-[0_0_0_2px] focus:outline-none"
                    aria-label="Close"
                  >
                    <XIcon />
                  </button>
                </Dialog.Close>
              </div>
              <div className="overflow-y-scroll grid gap-[2rem] p-[2rem] [&>section]:grid [&>section]:gap-[1rem]">
                <section
                  className={cn(
                    'p-[1.5rem] rounded-lg px-[2rem] bg-surface5 grid grid-cols-[5rem_1fr] gap-x-[2rem]',
                    '[&>em]:flex [&>em]:justify-between',
                    '[&_svg]:w-[1.1em] [&>svg]:h-[1.1em] [&_svg]:text-icon3 ',
                    '[&_b]:text-icon6 [&_b]:font-semibold',
                  )}
                >
                  <em>
                    Score <ArrowRightIcon />
                  </em>
                  <b>{score.result.score}</b>
                  <em>
                    Reason <ArrowRightIcon />
                  </em>
                  <MarkdownRenderer>{score.result.reason}</MarkdownRenderer>
                </section>
                <section>
                  <h2>Input</h2>
                  <MarkdownRenderer>{score.result.input}</MarkdownRenderer>
                </section>
                <section>
                  <h2>Output</h2>
                  <MarkdownRenderer>{score.result.output}</MarkdownRenderer>
                </section>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
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
          className={cn(
            'justify-center justify-items-center grid px-[2rem]',
            '3xl:grid-cols-[32rem_auto] 3xl:content-stretch',
          )}
        >
          <div
            className={cn(
              'grid z-[1] 3xl:sticky top-0 gap-y-[0.5rem] text-icon4 max-w-[90rem] w-[calc(100%-4rem)] mx-auto bg-surface2 py-[3rem]',
              '3xl:h-full 3xl:content-start 3xl:grid-rows-[auto_1fr] h-full 3xl:overflow-y-auto',
            )}
          >
            <div className="grid gap-[1rem]">
              <h1 className="text-icon6 text-[1.25rem]">{scorer.scorer.name}</h1>
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
              <div
                className={cn(
                  'flex gap-[1rem] text-[0.875rem] items-center',
                  '3xl:overflow-y-auto ',
                  '[&>svg]:w-[1em] [&>svg]:h-[1em] [&>svg]:text-icon3',
                )}
              >
                <span>Prompts</span>
                <ArrowRightIcon />
                <div className={cn(' flex items-center border border-b-0 border-border1 rounded-md', '')}>
                  {Object.entries(scorer?.prompts || {}).map(([key]) => (
                    <button
                      onClick={() => handlePromptChange(key)}
                      className={cn(
                        'px-[1rem] py-[0.4rem] border capitalize font-semibold justify-center border-r border-border1 flex items-center text-[0.8125rem] gap-[0.5rem]',
                        '[&>svg]:text-icon5 [&>svg]:w-[1.2em] [&>svg]:h-[1.2em]',
                        {
                          'bg-surface1  text-icon5': visiblePrompt === key,
                          // 'hover:bg-surface5 ': visiblePrompt !== key,
                        },
                      )}
                    >
                      {key}
                      {visiblePrompt === key && <ArrowDownIcon />}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <Tabs.Root value={visiblePrompt} className="mt-[.5rem] 3xl:h-full 3xl:overflow-y-auto">
              {Object.entries(scorer?.prompts || {}).map(([key, value]) => (
                <Tabs.Content value={key}>
                  <div className={`rounded-md border border-border1 bg-surface1 h-[15rem] 3xl:h-auto  overflow-y-auto`}>
                    <pre className="text-[0.8125rem] text-[#ccc] p-[1rem] whitespace-pre-wrap font-mono ">
                      {value.prompt}
                    </pre>
                  </div>
                </Tabs.Content>
              ))}
            </Tabs.Root>
          </div>

          <div className="mt-[1rem] 3xl:mt-[3rem] max-w-[90rem] w-[calc(100%-4rem)] mx-auto ">
            <div
              className={cn(
                'grid bg-surface3 gap-[1rem] sticky top-0 px-[1.5rem] py-[1rem] grid-cols-[8rem_7rem_1fr_1fr_3rem_5rem] text-left text-[0.75rem] text-icon3 uppercase',
              )}
            >
              <span>id</span>
              <span>Created At</span>
              <span>Input</span>
              <span>Output</span>
              <span>Score</span>
              <span className="w-[1.5rem]"></span>
            </div>
            <div className="grid  border border-border1f bg-surface3 rounded-xl ">
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
