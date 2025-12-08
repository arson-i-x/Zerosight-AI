const styles = {
  container: {
    padding: 20,
    maxWidth: 600,
    margin: "0 auto",
    fontFamily: "sans-serif"
  },
  header: {
    fontSize: 24,
    marginBottom: 20
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 12
  },
  card: {
    padding: 16,
    borderRadius: 8,
    backgroundColor: "#f4f4f4",
    border: "1px solid #ddd"
  },
  type: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 4
  },
  time: {
    fontSize: 12,
    opacity: 0.7
  },
  details: {
    marginTop: 8,
    background: "#eee",
    padding: 10,
    borderRadius: 6,
    fontSize: 12,
    overflowX: "auto"
  },
  noEvents: {
    opacity: 0.6,
    fontSize: 14
  },
  center: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 16,
    alignItems: "center",
    justifyContent: "center",
  },
};

export default styles;