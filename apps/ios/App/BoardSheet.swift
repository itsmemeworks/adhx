import SwiftUI

/// The boards' bottom sheet: full width, joined to the bottom edge, rounded
/// on top, with a handle, over a dimmed screen. (A system sheet at a partial
/// height floats inset from the edges on newer iOS.) Drag it down, tap the
/// dim or use the escape gesture to close it.
private struct BoardSheetHost<Sheet: View>: ViewModifier {
    let isPresented: Bool
    /// How tall it may get (it's never taller than the screen allows); it's
    /// as tall as what's in it below that, and scrolls above.
    let height: CGFloat
    let close: () -> Void
    @ViewBuilder let sheet: () -> Sheet
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var drag: CGFloat = 0
    /// The sheet's own height, measured: it's as tall as what's in it.
    @State private var fitted: CGFloat = 0

    func body(content: Content) -> some View {
        content
            .overlay {
                ZStack(alignment: .bottom) {
                    if isPresented {
                        Color.black.opacity(0.5)
                            .ignoresSafeArea()
                            .onTapGesture(perform: close)
                            .transition(.opacity)
                            .accessibilityHidden(true)
                        panel
                            .transition(reduceMotion ? .opacity : .move(edge: .bottom))
                    }
                }
                .animation(reduceMotion ? .easeOut(duration: 0.15) : .spring(response: 0.36, dampingFraction: 0.9),
                           value: isPresented)
            }
            .onChange(of: isPresented) { _, _ in drag = 0 }
    }

    private var panel: some View {
        GeometryReader { box in
            let room = box.size.height + box.safeAreaInsets.bottom - box.safeAreaInsets.top - 12
            VStack(spacing: 0) {
                Spacer(minLength: 0)
                VStack(spacing: 0) {
                    Capsule()
                        .fill(.white.opacity(0.22))
                        .frame(width: 40, height: 5)
                        .padding(.top, 8)
                        .padding(.bottom, 2)
                        .frame(maxWidth: .infinity)
                        .contentShape(Rectangle())
                        .accessibilityHidden(true)
                    ScrollView {
                        sheet()
                            .environment(\.boardDismiss, close)
                            .background(GeometryReader { inner in
                                Color.clear.preference(key: SheetHeight.self, value: inner.size.height)
                            })
                    }
                    .scrollIndicators(.hidden)
                    .scrollBounceBehavior(.basedOnSize)
                    .onPreferenceChange(SheetHeight.self) { fitted = $0 }
                }
                .frame(height: min(fitted > 0 ? fitted + 15 : height, height, room))
                .padding(.bottom, box.safeAreaInsets.bottom)
                .background(
                    UnevenRoundedRectangle(topLeadingRadius: 28, topTrailingRadius: 28, style: .continuous)
                        .fill(Theme.surface)
                        .shadow(color: .black.opacity(0.4), radius: 30, y: -8)
                )
                .offset(y: max(drag, 0))
                .simultaneousGesture(
                    DragGesture(minimumDistance: 12)
                        .onChanged { value in
                            // Only a mostly downward drag moves it (the rows inside may scroll).
                            if value.translation.height > abs(value.translation.width) { drag = value.translation.height }
                        }
                        .onEnded { value in
                            if value.translation.height > 120 || value.predictedEndTranslation.height > 260 {
                                close()
                            } else {
                                withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { drag = 0 }
                            }
                        }
                )
            }
            .ignoresSafeArea(edges: .bottom)
        }
        .accessibilityAddTraits(.isModal)
        .accessibilityAction(.escape, close)
    }
}

private struct SheetHeight: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = max(value, nextValue()) }
}

private struct BoardDismissKey: EnvironmentKey {
    static let defaultValue: (() -> Void)? = nil
}

extension EnvironmentValues {
    /// Closes the board sheet a view is in (nil outside one).
    var boardDismiss: (() -> Void)? {
        get { self[BoardDismissKey.self] }
        set { self[BoardDismissKey.self] = newValue }
    }
}

extension View {
    /// A board sheet while `isPresented` is on.
    func boardSheet<Sheet: View>(isPresented: Binding<Bool>, height: CGFloat,
                                 @ViewBuilder content: @escaping () -> Sheet) -> some View {
        modifier(BoardSheetHost(isPresented: isPresented.wrappedValue, height: height,
                                close: { isPresented.wrappedValue = false }, sheet: content))
    }

    /// A board sheet for `item` while it's set.
    func boardSheet<Item, Sheet: View>(item: Binding<Item?>, height: CGFloat,
                                       @ViewBuilder content: @escaping (Item) -> Sheet) -> some View {
        modifier(BoardSheetHost(isPresented: item.wrappedValue != nil, height: height,
                                close: { item.wrappedValue = nil }, sheet: {
                                    if let value = item.wrappedValue { content(value) }
                                }))
    }
}

/// Closes whichever sheet a view is in: a board sheet, or a system one.
struct SheetCloser {
    let board: (() -> Void)?
    let system: DismissAction

    func callAsFunction() {
        if let board { board() } else { system() }
    }
}
