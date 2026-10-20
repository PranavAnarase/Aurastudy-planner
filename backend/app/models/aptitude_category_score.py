class AptitudeCategoryScore:
    def __init__(self, id: int = None, session_id: int = None, category: str = None, accuracy: float = 0.0, percentile: float = 0.0):
        self.id = id
        self.session_id = session_id
        self.category = category
        self.accuracy = accuracy
        self.percentile = percentile
