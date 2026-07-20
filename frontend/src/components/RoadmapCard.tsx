import React from 'react';
import { ProgressRing } from './ProgressRing';
import type { Milestone, Topic } from '../lib/api';

interface RoadmapCardProps {
  milestone: Milestone;
  onSelectTopic: (topic: Topic) => void;
  onTakeQuiz: (milestone: Milestone) => void;
}

export const RoadmapCard: React.FC<RoadmapCardProps> = ({
  milestone,
  onSelectTopic,
  onTakeQuiz,
}) => {
  const totalTopics = milestone.topics.length;
  const completedTopics = milestone.topics.filter((t) => t.status === 'completed').length;
  const progressPercent = totalTopics === 0 ? 0 : Math.round((completedTopics / totalTopics) * 100);
  const allCompleted = completedTopics === totalTopics;

  return (
    <div
      className="rounded-xl border p-6 flex flex-col justify-between space-y-4 transition-all duration-300 hover:border-blaze/40 hover:-translate-y-0.5 hover:shadow-lg border-mist/60 bg-panel/30 backdrop-blur-sm"
    >
      <div>
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="font-mono-label text-xs text-fog uppercase">
            Milestone
          </span>
          {allCompleted && (
            <span className="bg-moss/20 text-moss text-[10px] font-mono-label rounded-full px-2 py-0.5 border border-moss/30">
              CLEARED
            </span>
          )}
        </div>
        <h4 className="font-display text-xl font-semibold text-parchment mt-1">{milestone.title}</h4>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-4">
        <ProgressRing percent={progressPercent} size={48} strokeWidth={4} />
        <div className="flex flex-col">
          <span className="text-xs font-mono-label text-fog">Progress</span>
          <span className="text-blaze font-bold">{progressPercent}%</span>
        </div>
      </div>

      {/* Topics */}
      <div className="space-y-3 pt-2">
        <p className="font-mono-label text-[10px] uppercase tracking-wider text-fog">Topics covered</p>
        <div className="space-y-2 max-h-40 overflow-y-auto pr-1 thin-scroll">
          {milestone.topics.map((topic) => {
            const topicColors = {
              completed: 'border-moss/30 bg-moss/5 text-moss hover:bg-moss/10',
              in_progress: 'border-blaze/30 bg-blaze/5 text-blaze hover:bg-blaze/10',
              available: 'border-blaze/30 bg-blaze/5 text-blaze hover:bg-blaze/10',
              locked: 'border-mist/40 bg-bg/20 text-fog hover:border-mist',
            };
            const topicLabels = {
              completed: 'Completed',
              in_progress: 'In Progress',
              available: 'Available',
              locked: 'Locked',
            };
            return (
              <div
                key={topic.topic_id}
                onClick={() => topic.status !== 'locked' && onSelectTopic(topic)}
                className={`flex items-start justify-between p-2.5 rounded border text-xs transition cursor-pointer hover:scale-[1.01] active:scale-[0.99] hover:shadow-sm ${topicColors[topic.status]}`}
                title={topic.status === 'locked' ? 'Topic locked by prerequisites' : 'Click to start course / study topic'}
              >
                <div className="space-y-0.5 text-left">
                  <p className="font-semibold flex items-center gap-1.5">
                    <span>{topic.status === 'locked' ? '🔒' : '📖'}</span>
                    <span>{topic.title}</span>
                  </p>
                  <p className="text-[10px] opacity-75">{topic.description}</p>
                </div>
                <span className="font-mono-label text-[10px] shrink-0 uppercase tracking-widest pl-2">
                  {topic.estimated_hours}h • {topicLabels[topic.status]}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Milestone actions (Take Quiz) */}
      <div className="pt-4 border-t border-mist/40 flex items-center justify-between">
        <span className="text-[10px] text-fog font-mono-label uppercase">
          Checkpoint: {milestone.checkpoint_quiz_id}
        </span>
        <button
          onClick={() => onTakeQuiz(milestone)}
          className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
            allCompleted
              ? 'bg-blaze text-bg hover:bg-blaze-dim'
              : 'bg-panel-raised border border-mist text-fog cursor-not-allowed'
          }`}
          disabled={!allCompleted}
          title={
            allCompleted
              ? 'Test your comprehension to clear the milestone'
              : 'Complete all milestone topics to unlock quiz'
          }
        >
          {allCompleted ? 'Take Quiz' : 'Quiz Locked'}
        </button>
      </div>
    </div>
  );
};
