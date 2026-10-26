class DomainError(ValueError):
    def __init__(self, message: str, code: str = "domain_error"):
        super().__init__(message)
        self.code = code
