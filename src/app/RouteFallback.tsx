import styles from '../components/App.module.css';

export default function RouteFallback() {
  return (
    <div className={styles.lazyFallback}>
      <div className={styles.skeletonBlock} />
      <div className={styles.skeletonGrid}><span /><span /><span /></div>
    </div>
  );
}
