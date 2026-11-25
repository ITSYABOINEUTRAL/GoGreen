import React from 'react';

const StarRating = ({ value = 0, max = 5, size = 24, onChange, count }) => {
  const interactive = typeof onChange === 'function';
  const stars = Array.from({ length: max }, (_, i) => i + 1);
  const current = Math.round(value);

  const handleKeyDown = (event, star) => {
    if (!interactive) return;
    let next = null;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        next = Math.min(max, star + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        next = Math.max(1, star - 1);
        break;
      case 'Home':
        next = 1;
        break;
      case 'End':
        next = max;
        break;
      case 'Enter':
      case ' ':
        next = star;
        break;
      default:
        return;
    }
    event.preventDefault();
    onChange(next);
  };

  const wrapperProps = interactive
    ? { role: 'radiogroup', 'aria-label': 'Star rating' }
    : { role: 'img', 'aria-label': `Rated ${value} out of ${max}` };

  return (
    <div className="star-rating" {...wrapperProps}>
      {stars.map((star) => {
        const filled = star <= current;
        const starProps = interactive
          ? {
              role: 'radio',
              'aria-checked': star === current,
              'aria-label': `${star} star${star === 1 ? '' : 's'}`,
              tabIndex: star === current ? 0 : -1,
              onClick: () => onChange(star),
              onKeyDown: (event) => handleKeyDown(event, star),
            }
          : { 'aria-hidden': true };

        return (
          <span
            key={star}
            className={`star ${filled ? 'star-filled' : 'star-empty'}`}
            style={{ fontSize: size, cursor: interactive ? 'pointer' : 'default' }}
            {...starProps}
          >
            {filled ? '\u2605' : '\u2606'}
          </span>
        );
      })}
      {typeof count === 'number' && <span className="star-count">({count})</span>}
    </div>
  );
};

export default StarRating;
